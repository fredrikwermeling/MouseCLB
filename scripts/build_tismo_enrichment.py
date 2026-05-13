#!/usr/bin/env python3
"""Build a TISMO enrichment file for MouseCLB.

TISMO (Tumor Immune Syngeneic MOuse) at https://tismo.pku-genomics.org
catalogues 92 syngeneic mouse cell lines with in-vitro and in-vivo
RNA-seq data drawn from 86+ public studies. Raw expression matrices
sit behind a download endpoint that returns plot images rather than
matrices, so packaging the full omics layer is a separate (heavier)
project. Meanwhile, the per-line metadata + sample counts + GEO
accessions ARE accessible via the API.

This script captures:
  - per-line: TISMO id, background, sex, year, parent, cancerType
  - per-line: count of in-vitro and in-vivo samples
  - per-line: list of GEO / TISMO study IDs (so users can fetch raw
    data directly from GEO)
  - per-line: count of ICB-treatment vivo samples (immuno-onc studies)

Output: web_data/tismo_enrichment.json. Re-run anytime; ~5 s, all
queries hit public endpoints with no auth.
"""
import json, os, sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_PATH = os.path.join(ROOT, 'web_data', 'tismo_enrichment.json')
API = 'https://tismo.pku-genomics.org/tismo'

def post_json(url, body):
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'User-Agent': 'MouseCLB-enrichment/0.1'}
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode('utf-8'))

def main():
    print('fetching TISMO cell-line metadata...')
    cl_resp = post_json(f'{API}/metaData/cellLineMeta', {'limit': 500, 'page': 1})
    cell_lines = cl_resp.get('data', [])
    print(f'  {len(cell_lines)} cell lines')

    print('fetching TISMO in-vitro sample metadata...')
    vt_resp = post_json(f'{API}/metaData/vitroMeta', {'limit': 2000, 'page': 1})
    vitro = vt_resp.get('data', [])
    print(f'  {len(vitro)} in-vitro samples')

    print('fetching TISMO in-vivo sample metadata...')
    vv_resp = post_json(f'{API}/metaData/vivoMeta', {'limit': 2000, 'page': 1})
    vivo = vv_resp.get('data', [])
    print(f'  {len(vivo)} in-vivo samples')

    # Per-line index: collapse all the things we want per cell line.
    by_line = {}
    for cl in cell_lines:
        name = cl['cellLine']
        by_line[name] = {
            'tismoId': cl.get('id'),
            'cancerType': cl.get('cancerType'),
            'background': cl.get('background'),
            'sex': cl.get('sex') or None,
            'origin': cl.get('origin'),
            'originYear': cl.get('originYear'),
            'parent': cl.get('parent') or None,
            'vitroSamples': 0,
            'vivoSamples': 0,
            'icbTreatedSamples': 0,
            'studies': [],
            'mouseStrains': set(),
            'icbTreatments': set(),
            'cellTreatments': set()
        }

    studies = {}
    for s in vitro:
        name = s.get('cellLine')
        if name not in by_line: continue
        e = by_line[name]
        try: e['vitroSamples'] += int(s.get('replicates') or 0)
        except Exception: e['vitroSamples'] += 1
        sid = s.get('studyId')
        if sid: studies.setdefault(name, set()).add(sid)
        ct = s.get('cellTreatment') or ''
        if ct and ct != 'no_treatment':
            e['cellTreatments'].add(ct)

    for s in vivo:
        name = s.get('cellLine')
        if name not in by_line: continue
        e = by_line[name]
        try: e['vivoSamples'] += int(s.get('replicates') or 0)
        except Exception: e['vivoSamples'] += 1
        sid = s.get('studyId')
        if sid: studies.setdefault(name, set()).add(sid)
        mt = (s.get('mouseTreatment') or '').strip()
        # Anything other than untreated counts as an ICB / drug arm.
        if mt and mt.lower() not in ('no_treatment', 'untreated', '', 'control'):
            e['icbTreatments'].add(mt)
            try: e['icbTreatedSamples'] += int(s.get('replicates') or 0)
            except Exception: e['icbTreatedSamples'] += 1
        ms = s.get('mouseStrain')
        if ms: e['mouseStrains'].add(ms)

    for name, e in by_line.items():
        e['studies'] = sorted(studies.get(name, []))
        e['mouseStrains'] = sorted(e['mouseStrains'])
        e['icbTreatments'] = sorted(e['icbTreatments'])
        e['cellTreatments'] = sorted(e['cellTreatments'])

    out = {
        '_doc': 'Per-cell-line TISMO enrichment: sample counts, study IDs (mostly GEO accessions), ICB-arm flags, host-strain options. Built by scripts/build_tismo_enrichment.py against https://tismo.pku-genomics.org. Raw expression matrices live behind the TISMO download pages; this file links each MouseCLB cell line to its TISMO entry so users can dive deeper.',
        '_schemaVersion': 1,
        'byName': by_line
    }
    with open(OUT_PATH, 'w') as f:
        json.dump(out, f, indent=1)
    print(f'wrote {OUT_PATH}: {len(by_line)} lines, '
          f'{sum(e["vitroSamples"] for e in by_line.values())} vitro samples, '
          f'{sum(e["vivoSamples"] for e in by_line.values())} vivo samples')

if __name__ == '__main__':
    main()
