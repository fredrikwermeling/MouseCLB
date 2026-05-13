#!/usr/bin/env python3
"""Fetch Wikipedia summaries for cell lines that have a page.

Uses the MediaWiki REST API: /api/rest_v1/page/summary/{title}. For
each cell line, we try a few title spellings and keep the result only
if the page extract contains tokens like "cell line" + "cancer" or
"tumor" — this filters out spurious matches (e.g. a person named
"4T1" or a movie called "MC38").

Few lines have dedicated Wikipedia pages; we expect ~5-15 matches out
of ~600. The ones that DO have pages tend to be the most-studied
workhorses (MC38, B16 melanoma, CT26, MCF-7-mouse-analog, etc.) where
the narrative summary adds genuine context.

Output: web_data/wikipedia_summaries.json.
"""
import json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
META_PATH = os.path.join(ROOT, 'web_data', 'metadata.json')
LIT_PATH  = os.path.join(ROOT, 'web_data', 'literature_lines.json')
OUT_PATH  = os.path.join(ROOT, 'web_data', 'wikipedia_summaries.json')
API = 'https://en.wikipedia.org/api/rest_v1/page/summary/'
SLEEP = 0.2
MAX_RETRIES = 3

CELLLINE_TOKENS = ['cell line', 'cell-line', 'cells']
CANCER_TOKENS   = ['cancer', 'tumor', 'tumour', 'carcinoma', 'leukemia', 'lymphoma', 'melanoma', 'sarcoma']
MOUSE_TOKENS    = ['mouse', 'murine', 'mice', 'c57bl', 'balb/c', 'syngeneic']

def try_fetch(title):
    url = API + urllib.parse.quote(title)
    for attempt in range(MAX_RETRIES):
        req = urllib.request.Request(url, headers={'User-Agent': 'MouseCLB-enrichment/0.1 (research aggregator)'})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            if e.code == 429:
                time.sleep(2 + attempt * 2)
                continue
            return None
        except Exception:
            time.sleep(1)
            continue
    return None

def looks_relevant(extract):
    if not extract: return False
    lo = extract.lower()
    is_cellline = any(t in lo for t in CELLLINE_TOKENS)
    is_cancer   = any(t in lo for t in CANCER_TOKENS)
    is_mouse    = any(t in lo for t in MOUSE_TOKENS)
    # Accept if it's clearly a cell line AND (cancer OR mouse context).
    # Or if cancer + mouse appear together (covers articles titled
    # "B16 melanoma" that don't use the words "cell line").
    if is_cellline and (is_cancer or is_mouse): return True
    if is_cancer and is_mouse: return True
    return False

def candidates_for(name):
    """Title spellings to try, in order of preference. Includes the
    common cell-line article naming conventions (X_cells, X_melanoma,
    X_(cell_line), Lewis_lung_carcinoma, etc.)."""
    base = name.strip()
    flat = base.replace(' ', '_')
    out = [
        f'{base}_(cell_line)',
        f'{flat}_cells',
        f'{flat}_(cells)',
        f'{flat}_melanoma',
        f'{flat}_(melanoma)',
        flat,
        base.replace('/', ''),
        base.replace('-', ''),
        base
    ]
    # 4T1, EL4, etc. → also try EL-4, 4-T-1 variants? Skip — over-broadens.
    seen = set()
    result = []
    for c in out:
        if c not in seen:
            seen.add(c)
            result.append(c)
    return result

def main():
    meta = json.load(open(META_PATH))
    lit = json.load(open(LIT_PATH))

    targets = []
    for cl in meta['cellLines']:
        nm = (meta['names'].get(cl) or '').strip()
        if len(nm) >= 3:
            targets.append((cl, nm))
    for entry in lit['lines']:
        if len(entry['name']) >= 3:
            targets.append((entry['id'], entry['name']))

    if os.path.exists(OUT_PATH):
        out = json.load(open(OUT_PATH))
    else:
        out = {
            '_doc': 'Wikipedia narrative summaries for cell lines with a dedicated MediaWiki page. Built by scripts/enrich_with_wikipedia.py. Only stored when the page extract clearly references "cell line" + cancer/mouse tokens, to filter spurious matches.',
            'byCellLine': {}
        }

    done = set(out['byCellLine'].keys())
    todo = [(cl, nm) for cl, nm in targets if cl not in done]
    print(f'cell lines: {len(targets)} total, {len(done)} already done, {len(todo)} to query')

    n_hit = sum(1 for v in out['byCellLine'].values() if v)
    for i, (cl, nm) in enumerate(todo):
        result = None
        for title in candidates_for(nm):
            d = try_fetch(title)
            if d and d.get('type') == 'standard' and looks_relevant(d.get('extract', '')):
                result = {
                    'title': d.get('title'),
                    'extract': d.get('extract'),
                    'pageUrl': (d.get('content_urls', {}).get('desktop', {}) or {}).get('page'),
                    'thumbnail': (d.get('thumbnail') or {}).get('source')
                }
                break
            time.sleep(SLEEP)
        out['byCellLine'][cl] = result
        if result: n_hit += 1
        if (i + 1) % 50 == 0 or (i + 1) == len(todo):
            json.dump(out, open(OUT_PATH, 'w'), indent=1)
            sys.stdout.write(f'\r  progress: {i+1}/{len(todo)} queried ({n_hit} hits)')
            sys.stdout.flush()

    print()
    json.dump(out, open(OUT_PATH, 'w'), indent=1)
    print(f'wrote {OUT_PATH}: {n_hit} pages found')
    print('matched lines:')
    for cl, v in out['byCellLine'].items():
        if v: print(f'  {cl:>12}  {v["title"]:30}  {v["pageUrl"]}')

if __name__ == '__main__':
    main()
