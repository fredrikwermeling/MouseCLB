#!/usr/bin/env python3
"""Enrich MCCA metadata with Cellosaurus identity data.

For each cell line in web_data/metadata.json, search the Cellosaurus
public API by name and keep the best-matched Mus musculus record. We
store RRID, synonyms, NCIt disease label, and caution comments — the
same fields shown for the literature-curated lines, so the detail
pane renders uniformly across MCCA and literature sources.

Output: web_data/mcca_cellosaurus.json. Loaded by app.js at startup
and merged on top of metadata.json so MCCA's own metadata stays clean
(this file is independently re-runnable).

Idempotent: writes intermediate state every 25 lines so re-running
picks up where it left off. Polite to the API: 0.15 s between
requests; should complete in ~2 min for 590 lines.
"""
import json, time, urllib.parse, urllib.request, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
META_PATH = os.path.join(ROOT, 'web_data', 'metadata.json')
OUT_PATH  = os.path.join(ROOT, 'web_data', 'mcca_cellosaurus.json')
API = 'https://api.cellosaurus.org'
SLEEP = 0.15

def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'MouseCLB-enrichment/0.1'})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode('utf-8'))

def search_line(name):
    """Return best mouse Cellosaurus hit for `name`, or None."""
    q = urllib.parse.quote(name)
    try:
        d = fetch_json(f'{API}/search/cell-line?q={q}&format=json')
    except Exception as e:
        return {'_error': str(e)}
    hits = d.get('Cellosaurus', {}).get('cell-line-list', [])
    name_lc = name.lower()
    best = None
    best_score = -1
    for h in hits:
        sp = (h.get('species-list') or [{}])[0].get('label', '')
        if 'Mus musculus' not in sp:
            continue
        nm_list = h.get('name-list', [])
        ident = next((n['value'] for n in nm_list if n.get('type') == 'identifier'), '')
        syns  = [n['value'] for n in nm_list if n.get('type') == 'synonym']
        all_names = [ident] + syns
        # Score: exact match on identifier = 3, exact match on synonym = 2,
        # substring on identifier = 1, otherwise 0.
        score = 0
        for nm in all_names:
            nm_lc = (nm or '').lower()
            if nm_lc == name_lc:
                score = max(score, 3 if nm == ident else 2)
            elif name_lc and (name_lc in nm_lc or nm_lc in name_lc):
                score = max(score, 1)
        if score > best_score:
            best_score = score
            best = h
    if best is None or best_score < 1:
        return None
    return extract_fields(best)

def extract_fields(h):
    accs = h.get('accession-list', [])
    primary = next((a['value'] for a in accs if a.get('type') == 'primary'), None)
    nm_list = h.get('name-list', [])
    ident = next((n['value'] for n in nm_list if n.get('type') == 'identifier'), '')
    syns  = [n['value'] for n in nm_list if n.get('type') == 'synonym']
    disease = h.get('disease-list') or []
    dz_label = disease[0].get('label') if disease else None
    breed = h.get('breed')
    sex = h.get('sex')
    cautions = [c.get('value') for c in (h.get('comment-list') or []) if c.get('category') == 'Caution']
    # Distributor cross-refs: each provider entry has a database name
    # (ATCC, Kerafast, Sigma, ABM, etc.) plus an accession and URL.
    providers = []
    for x in (h.get('xref-list') or []):
        if x.get('category') == 'Cell line collections (Providers)' and not x.get('discontinued'):
            providers.append({
                'db': x.get('database'),
                'accession': x.get('accession'),
                'url': x.get('url')
            })
    return {
        'rrid': primary,
        'identifier': ident,
        'synonyms': syns,
        'ncitDisease': dz_label,
        'breed': breed,
        'sex': sex,
        'cautions': cautions or None,
        'providers': providers or None
    }

def main():
    meta = json.load(open(META_PATH))
    cls = meta['cellLines']
    names = meta.get('names', {})

    # Resume from existing partial output.
    if os.path.exists(OUT_PATH):
        out = json.load(open(OUT_PATH))
    else:
        out = {'_doc': 'Cellosaurus enrichment for MCCA lines. Output of scripts/enrich_with_cellosaurus.py.', 'byCellLine': {}}

    done = set(out['byCellLine'].keys())
    todo = [cl for cl in cls if cl not in done]
    print(f'lines: {len(cls)} total, {len(done)} already done, {len(todo)} to fetch')

    n_hit = sum(1 for v in out['byCellLine'].values() if v and v.get('rrid'))
    n_miss = len(done) - n_hit

    for i, cl in enumerate(todo):
        nm = names.get(cl) or cl
        res = search_line(nm)
        if res is None:
            out['byCellLine'][cl] = None
            n_miss += 1
        elif '_error' in res:
            # Transient error — skip, will retry next run.
            print(f'  [{i+1}/{len(todo)}] {cl} ({nm}): error {res["_error"]}')
            continue
        else:
            out['byCellLine'][cl] = res
            n_hit += 1
        if (i + 1) % 25 == 0 or (i + 1) == len(todo):
            json.dump(out, open(OUT_PATH, 'w'), indent=1)
            sys.stdout.write(f'\r  progress: {i+1}/{len(todo)} fetched ({n_hit} hits / {n_miss} misses)')
            sys.stdout.flush()
        time.sleep(SLEEP)

    print()
    json.dump(out, open(OUT_PATH, 'w'), indent=1)
    print(f'wrote {OUT_PATH}: {n_hit} matched, {n_miss} no Cellosaurus record')

if __name__ == '__main__':
    main()
