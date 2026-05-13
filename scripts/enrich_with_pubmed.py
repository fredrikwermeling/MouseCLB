#!/usr/bin/env python3
"""Enrich each cell line with a PubMed literature-presence count.

Hits NCBI E-utilities ESearch for `<cell_line_name>[Title/Abstract] AND
mouse[MeSH] AND cancer[Title/Abstract]` and stores the total result
count. The PubMed query is also constructed as a URL so users can
click through to the full result list in the app.

The combined name + mouse + cancer query filters out hits that share
the name with non-cell-line tokens (e.g. "MC38" without context).
Cell-line names < 4 chars are skipped to avoid spurious hits.

NCBI rate limit: 3 requests/sec without an API key, 10/sec with one.
Polite sleep = 0.4 s. Output: web_data/pubmed_presence.json.
"""
import json, time, os, sys, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
META_PATH = os.path.join(ROOT, 'web_data', 'metadata.json')
LIT_PATH  = os.path.join(ROOT, 'web_data', 'literature_lines.json')
OUT_PATH  = os.path.join(ROOT, 'web_data', 'pubmed_presence.json')
EUTIL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
SLEEP = 0.4

def make_query(name):
    # Quoted exact phrase + mouse + cancer/tumor disambiguator.
    return f'"{name}"[Title/Abstract] AND (mouse[MeSH] OR murine[Title/Abstract]) AND (cancer[Title/Abstract] OR tumor[Title/Abstract] OR carcinoma[Title/Abstract] OR leukemia[Title/Abstract] OR lymphoma[Title/Abstract] OR melanoma[Title/Abstract])'

def count_for(name):
    q = make_query(name)
    url = f'{EUTIL}?db=pubmed&term={urllib.parse.quote(q)}&retmax=0&retmode=json'
    req = urllib.request.Request(url, headers={'User-Agent': 'MouseCLB-enrichment/0.1'})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            d = json.loads(r.read().decode('utf-8'))
        return int(d.get('esearchresult', {}).get('count', 0)), q
    except Exception as e:
        return None, q

def main():
    meta = json.load(open(META_PATH))
    lit = json.load(open(LIT_PATH))

    # Build the full list (MCCA names + literature names).
    targets = []
    for cl in meta['cellLines']:
        nm = (meta['names'].get(cl) or '').strip()
        if len(nm) >= 4:
            targets.append((cl, nm))
    for entry in lit['lines']:
        if len(entry['name']) >= 4:
            targets.append((entry['id'], entry['name']))

    # Resume from existing partial output.
    if os.path.exists(OUT_PATH):
        out = json.load(open(OUT_PATH))
    else:
        out = {
            '_doc': 'Per-cell-line PubMed literature-presence counts. Built by scripts/enrich_with_pubmed.py against NCBI E-utilities. The query disambiguates by requiring "mouse"/"murine" + "cancer"/"tumor"/etc. tokens so common short names do not spuriously match unrelated papers.',
            'byCellLine': {}
        }

    done = set(out['byCellLine'].keys())
    todo = [(cl, nm) for cl, nm in targets if cl not in done]
    print(f'cell lines: {len(targets)} total, {len(done)} already done, {len(todo)} to query')

    for i, (cl, nm) in enumerate(todo):
        n, q = count_for(nm)
        if n is None:
            # Transient error — skip, will retry on next run.
            continue
        out['byCellLine'][cl] = {'name': nm, 'count': n, 'pubmedUrl': f'https://pubmed.ncbi.nlm.nih.gov/?term={urllib.parse.quote(q)}'}
        if (i + 1) % 25 == 0 or (i + 1) == len(todo):
            json.dump(out, open(OUT_PATH, 'w'), indent=1)
            sys.stdout.write(f'\r  progress: {i+1}/{len(todo)} queried')
            sys.stdout.flush()
        time.sleep(SLEEP)

    print()
    json.dump(out, open(OUT_PATH, 'w'), indent=1)
    counts = sorted(((v['name'], v['count']) for v in out['byCellLine'].values()), key=lambda x: -x[1])
    print(f'wrote {OUT_PATH}: {len(out["byCellLine"])} lines queried')
    print('top 10 by PubMed presence:')
    for nm, n in counts[:10]:
        print(f'  {n:>6}  {nm}')

if __name__ == '__main__':
    main()
