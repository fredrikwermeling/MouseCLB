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

    # Per-line index. Capture the per-sample richness — distinct cell
    # genotypes, sub-clones, mouse strains, treatments tested, and the
    # per-sample ICB-response labels (R / NR / Baseline) so users see
    # what the cell line has actually been used for in immuno-onc work.
    from collections import Counter
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
            'studies': [],
            # Distributions (Counter → dict for JSON):
            'vitroCellGenotype':   Counter(),
            'vitroCellTreatment':  Counter(),
            'vitroSubClone':       Counter(),
            'vivoCellGenotype':    Counter(),
            'vivoSubClone':        Counter(),
            'vivoMouseGenotype':   Counter(),
            'vivoMouseStrain':     Counter(),
            'vivoMouseTreatment':  Counter(),
            'vivoImplantationSite': Counter(),
            'icbResponseDistro':   Counter(),  # R / NR / Baseline / untreated
        }

    studies = {}

    def reps(s):
        try: return int(s.get('replicates') or 1)
        except Exception: return 1

    for s in vitro:
        name = s.get('cellLine')
        if name not in by_line: continue
        e = by_line[name]
        n = reps(s)
        e['vitroSamples'] += n
        sid = s.get('studyId')
        if sid: studies.setdefault(name, set()).add(sid)
        ct = (s.get('cellTreatment') or '').strip()
        cg = (s.get('cellGenotype') or '').strip()
        sc = (s.get('subClone') or '').strip()
        if ct: e['vitroCellTreatment'][ct] += n
        if cg: e['vitroCellGenotype'][cg] += n
        if sc: e['vitroSubClone'][sc] += n

    for s in vivo:
        name = s.get('cellLine')
        if name not in by_line: continue
        e = by_line[name]
        n = reps(s)
        e['vivoSamples'] += n
        sid = s.get('studyId')
        if sid: studies.setdefault(name, set()).add(sid)
        cg = (s.get('cellGenotype') or '').strip()
        sc = (s.get('subClone') or '').strip()
        mg = (s.get('mouseGenotype') or '').strip()
        ms = (s.get('mouseStrain') or '').strip()
        mt = (s.get('mouseTreatment') or '').strip()
        impl = (s.get('implantationSite') or '').strip()
        icb = (s.get('icbStudy') or '').strip()
        if cg: e['vivoCellGenotype'][cg] += n
        if sc: e['vivoSubClone'][sc] += n
        if mg: e['vivoMouseGenotype'][mg] += n
        if ms: e['vivoMouseStrain'][ms] += n
        if mt: e['vivoMouseTreatment'][mt] += n
        if impl: e['vivoImplantationSite'][impl] += n
        # The icbStudy field is empty for non-ICB studies; for ICB studies
        # it carries R / NR / Baseline / unknown per-sample labels.
        label = icb if icb else 'untreated'
        e['icbResponseDistro'][label] += n

    # Convert Counters to dicts (sorted by count desc), drop empty.
    def top_dict(c, k=8):
        if not c: return None
        # Cap at top-k entries; the rest are usually long tail of variants.
        items = sorted(c.items(), key=lambda x: -x[1])
        return dict(items[:k])

    for name, e in by_line.items():
        e['studies'] = sorted(studies.get(name, []))
        for k in list(e.keys()):
            if isinstance(e[k], Counter):
                e[k] = top_dict(e[k])
        # Quick derived: total ICB-arm samples (R + NR), responder rate
        rd = e.get('icbResponseDistro') or {}
        r = rd.get('R', 0)
        nr = rd.get('NR', 0)
        baseline = rd.get('Baseline', 0)
        e['icbArmSamples'] = r + nr
        e['icbResponders'] = r
        e['icbNonResponders'] = nr
        e['icbBaselineSamples'] = baseline
        # Keep legacy "icbTreatedSamples" for backward compatibility
        e['icbTreatedSamples'] = r + nr

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
