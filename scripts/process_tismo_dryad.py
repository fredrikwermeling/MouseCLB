#!/usr/bin/env python3
"""Process the TISMO companion data (Zeng 2022, Dryad doi:10.5061/dryad.b8gtht7g1)
into a compact per-cell-line immune-gene panel.

Inputs (~200 MB CSV total, not committed):
  preICB_phenotype.csv   sample × feature one-hot metadata (pre-ICB cohort)
  preICB_response.csv    sample × {R, NR} per-sample response labels
  preICB_exprn.csv       gene × sample TPM matrix (quantile-norm + ComBat)
  postICB_phenotype.csv  ditto for post-ICB cohort
  postICB_response.csv
  postICB_exprn.csv

For each cell line covered (~20 lines: 4T1, B16, CT26, EMT6, MC38, LLC,
Renca, E0771, MOC22, AB1, T11, YTN16, YTN2, KPB25L, p53-2225L/2336R, etc.)
we compute mean expression of a curated 120-gene immune panel, stratified
into three buckets:
  - preICB_baseline   (untreated control samples)
  - postICB_R         (responder samples after ICB)
  - postICB_NR        (non-responder samples after ICB)

Output (~50-100 KB): web_data/tismo_immune_panel.json. Used by the app
to render an "Immune gene panel (TISMO)" detail section.
"""
import csv, json, os, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, 'doi_10_5061_dryad_b8gtht7g1__v20220815')
OUT_PATH = os.path.join(ROOT, 'web_data', 'tismo_immune_panel.json')

# Curated immune / tumour-microenvironment gene panel (mouse symbols).
# Organized into functional groups so the UI can render thematic bars.
PANEL = {
    'Checkpoint':              ['Cd274', 'Pdcd1lg2', 'Cd80', 'Cd86', 'Ctla4', 'Lag3', 'Havcr2', 'Tigit', 'Vsir', 'Btla', 'Pdcd1', 'Tnfrsf9', 'Cd40', 'Cd40lg', 'Icoslg', 'Icos'],
    'MHC-I':                   ['H2-K1', 'H2-D1', 'H2-T22', 'B2m', 'Tap1', 'Tap2', 'Tapbp', 'Erap1', 'Psmb8', 'Psmb9', 'Nlrc5'],
    'MHC-II':                  ['H2-Ab1', 'H2-Aa', 'H2-Eb1', 'H2-DMa', 'H2-DMb1', 'Cd74', 'Ciita'],
    'IFN-γ / T-cell infl.':    ['Ifng', 'Ifngr1', 'Ifngr2', 'Stat1', 'Irf1', 'Cxcl9', 'Cxcl10', 'Cxcl11', 'Gzmb', 'Gzma', 'Prf1', 'Cd8a', 'Cd8b1', 'Cd3d', 'Cd3e', 'Cd3g', 'Cd4'],
    'T-reg / suppression':     ['Foxp3', 'Il2ra', 'Tnfrsf18', 'Il10', 'Tgfb1', 'Tgfb2', 'Tgfb3', 'Entpd1', 'Nt5e'],
    'MDSC / myeloid suppr.':   ['Arg1', 'Nos2', 'S100a8', 'S100a9', 'Ly6g', 'Itgam', 'Cebpb', 'Csf1', 'Csf1r', 'Ccl2'],
    'Macrophage':              ['Cd68', 'Itgax', 'Mrc1', 'Cd163', 'Tnf', 'Il6', 'Il12a', 'Il12b', 'Nos2', 'Arg1'],
    'NK cell':                 ['Klrb1c', 'Ncr1', 'Klrk1', 'Klrd1', 'Klre1', 'Klrc1', 'Klra8'],
    'Dendritic cell':          ['Itgae', 'Xcr1', 'Clec9a', 'Batf3', 'Flt3', 'Irf8', 'Sirpa', 'Cd24a'],
    'Chemokine / TLS':         ['Ccl5', 'Ccl19', 'Ccl21a', 'Ccr7', 'Cxcl13', 'Cxcr3', 'Cxcr5', 'Ccl3', 'Ccl4', 'Ccl17'],
    'EMT / stem':              ['Zeb1', 'Snai1', 'Twist1', 'Vim', 'Cdh1', 'Cdh2', 'Sox2'],
    'Stress / hypoxia':        ['Vegfa', 'Hif1a', 'Cd44', 'Hmgb1']
}
ALL_PANEL = sorted({g for gs in PANEL.values() for g in gs})
PANEL_SET = set(ALL_PANEL)
print(f'panel: {len(ALL_PANEL)} unique genes across {len(PANEL)} groups')

# ---- 1. Parse phenotype to map sample → cell_line + treatment one-hots ----
def parse_phenotype(path):
    """Return: samples [...], by_sample {sample: {'cellLine': X, 'pd1':bool, ...}}"""
    samples = None
    sample_meta = defaultdict(dict)
    cell_lines = {}        # idx → cl name
    treatments = {'PD1': {}, 'PDL1': {}, 'CTLA4': {}, 'PDL2': {}}  # tx → idx → 0/1
    strains = {}           # idx → strain
    with open(path) as f:
        rdr = csv.reader(f)
        for i, row in enumerate(rdr):
            if i == 0:
                samples = row[1:]
                continue
            feat = row[0]
            vals = row[1:]
            if feat.startswith('Cell_Line_'):
                cl = feat[len('Cell_Line_'):]
                for j, v in enumerate(vals):
                    if v == '1':
                        cell_lines[j] = cl
            elif feat.startswith('Mouse_strain_'):
                st = feat[len('Mouse_strain_'):]
                for j, v in enumerate(vals):
                    if v == '1':
                        strains[j] = st
            elif feat in ('PD1_1', 'PDL1_1', 'CTLA4_1', 'PDL2_1'):
                tx = feat.replace('_1', '')
                for j, v in enumerate(vals):
                    if v == '1':
                        treatments[tx][j] = 1
    return samples, cell_lines, treatments, strains

def parse_response(path):
    """Return {sample_idx: 'R' or 'NR'}."""
    out = {}
    with open(path) as f:
        rdr = csv.reader(f)
        samples = None
        for i, row in enumerate(rdr):
            if i == 0:
                samples = row[1:]
                continue
            label = row[0]
            if label not in ('R', 'NR'): continue
            for j, v in enumerate(row[1:]):
                if v == '1':
                    out[j] = label
    return samples, out

# ---- 2. Stream the expression matrix, keep only panel rows ----
def stream_expression(path, panel_set, sample_count_expected=None):
    """Return {gene: list of float values across samples}."""
    out = {}
    with open(path) as f:
        rdr = csv.reader(f)
        for i, row in enumerate(rdr):
            if i == 0:
                if sample_count_expected and len(row) - 1 != sample_count_expected:
                    print(f'warning: header has {len(row)-1} cols, expected {sample_count_expected}')
                continue
            gene = row[0]
            if gene in panel_set:
                # Convert to float, NaN-tolerant
                try:
                    out[gene] = [float(x) if x else float('nan') for x in row[1:]]
                except ValueError:
                    out[gene] = []
    return out

def main():
    print('--- pre-ICB cohort ---')
    pre_samples, pre_cl, pre_tx, pre_strains = parse_phenotype(os.path.join(DATA_DIR, 'preICB_phenotype.csv'))
    pre_resp_samples, pre_resp = parse_response(os.path.join(DATA_DIR, 'preICB_response.csv'))
    assert pre_samples == pre_resp_samples, 'pre samples mismatch'
    print(f'  {len(pre_samples)} samples; cell-line tags on {len(pre_cl)}')
    print(f'  R={sum(1 for v in pre_resp.values() if v == "R")}, NR={sum(1 for v in pre_resp.values() if v == "NR")}')
    pre_expr = stream_expression(os.path.join(DATA_DIR, 'preICB_exprn.csv'), PANEL_SET, len(pre_samples))
    print(f'  panel genes captured (pre): {len(pre_expr)}/{len(PANEL_SET)}')

    print('--- post-ICB cohort ---')
    post_samples, post_cl, post_tx, post_strains = parse_phenotype(os.path.join(DATA_DIR, 'postICB_phenotype.csv'))
    post_resp_samples, post_resp = parse_response(os.path.join(DATA_DIR, 'postICB_response.csv'))
    assert post_samples == post_resp_samples, 'post samples mismatch'
    print(f'  {len(post_samples)} samples; cell-line tags on {len(post_cl)}')
    print(f'  R={sum(1 for v in post_resp.values() if v == "R")}, NR={sum(1 for v in post_resp.values() if v == "NR")}')
    post_expr = stream_expression(os.path.join(DATA_DIR, 'postICB_exprn.csv'), PANEL_SET, len(post_samples))
    print(f'  panel genes captured (post): {len(post_expr)}/{len(PANEL_SET)}')

    # ---- 3. Aggregate per cell line × condition ----
    def mean_or_none(xs):
        valid = [x for x in xs if x is not None and x == x]  # NaN check
        if not valid: return None
        return round(sum(valid) / len(valid), 3)

    by_line = defaultdict(lambda: {'preICB_baseline': {'n': 0, 'mean': {}},
                                    'postICB_R':       {'n': 0, 'mean': {}},
                                    'postICB_NR':      {'n': 0, 'mean': {}}})

    # Pre-ICB: all samples are baseline (no ICB applied yet).
    # Group samples by cell line, then for each gene compute mean.
    cl_to_pre_samples = defaultdict(list)
    for idx, cl in pre_cl.items(): cl_to_pre_samples[cl].append(idx)
    for cl, idxs in cl_to_pre_samples.items():
        by_line[cl]['preICB_baseline']['n'] = len(idxs)
        gm = {}
        for g, vals in pre_expr.items():
            xs = [vals[i] for i in idxs if i < len(vals)]
            v = mean_or_none(xs)
            if v is not None: gm[g] = v
        by_line[cl]['preICB_baseline']['mean'] = gm

    # Post-ICB: stratify by R / NR.
    cl_to_post_R = defaultdict(list)
    cl_to_post_NR = defaultdict(list)
    for idx, cl in post_cl.items():
        lbl = post_resp.get(idx)
        if lbl == 'R':  cl_to_post_R[cl].append(idx)
        elif lbl == 'NR': cl_to_post_NR[cl].append(idx)
    for cl, idxs in cl_to_post_R.items():
        by_line[cl]['postICB_R']['n'] = len(idxs)
        gm = {}
        for g, vals in post_expr.items():
            xs = [vals[i] for i in idxs if i < len(vals)]
            v = mean_or_none(xs)
            if v is not None: gm[g] = v
        by_line[cl]['postICB_R']['mean'] = gm
    for cl, idxs in cl_to_post_NR.items():
        by_line[cl]['postICB_NR']['n'] = len(idxs)
        gm = {}
        for g, vals in post_expr.items():
            xs = [vals[i] for i in idxs if i < len(vals)]
            v = mean_or_none(xs)
            if v is not None: gm[g] = v
        by_line[cl]['postICB_NR']['mean'] = gm

    # Cohort-wide stats per gene so the UI can z-score / rank lines
    # against the cohort if it wants to.
    cohort_stats = {}
    for g in ALL_PANEL:
        all_vals = []
        if g in pre_expr:  all_vals += [v for v in pre_expr[g] if v == v]
        if g in post_expr: all_vals += [v for v in post_expr[g] if v == v]
        if all_vals:
            n = len(all_vals)
            mean = sum(all_vals) / n
            var = sum((x - mean) ** 2 for x in all_vals) / n
            cohort_stats[g] = {'n': n, 'mean': round(mean, 3), 'sd': round(var ** 0.5, 3)}

    out = {
        '_doc': 'Per-cell-line immune-gene-panel expression aggregated from the TISMO companion data (Zeng 2022, Dryad doi:10.5061/dryad.b8gtht7g1). For each line, three buckets: preICB_baseline (untreated control samples), postICB_R (responder samples after checkpoint blockade), postICB_NR (non-responder samples). Values are mean of the quantile-normalised + ComBat-corrected TPM (log scale, as deposited).',
        'source': {
            'name': 'TISMO / Dryad (Zeng 2022)',
            'doi': '10.5061/dryad.b8gtht7g1',
            'url': 'https://datadryad.org/dataset/doi:10.5061/dryad.b8gtht7g1',
            'paper': 'Zeng et al. 2022, Machine learning on syngeneic mouse tumor profiles to model clinical immunotherapy response'
        },
        'panel': PANEL,
        'cohortStats': cohort_stats,
        'byCellLine': dict(by_line)
    }
    with open(OUT_PATH, 'w') as f:
        json.dump(out, f, indent=1)
    print(f'wrote {OUT_PATH}')
    print(f'  cell lines covered: {len(by_line)}')
    for cl, e in sorted(by_line.items()):
        b = e['preICB_baseline']['n']; r = e['postICB_R']['n']; nr = e['postICB_NR']['n']
        print(f'    {cl:<20} baseline={b:3d}  R={r:3d}  NR={nr:3d}')

if __name__ == '__main__':
    main()
