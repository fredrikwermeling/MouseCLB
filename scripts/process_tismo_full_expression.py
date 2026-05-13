#!/usr/bin/env python3
"""Process the full Dryad TISMO expression matrix into a compact binary blob
for the per-gene expression browser.

Builds a gene-major int16 tensor [nGenes × nCellLines × 3] where the
3 slots are [baseline_mean, R_mean, NR_mean]. Pre-aggregating per
cell-line × condition collapses ~760 raw samples → 22 cell lines × 3
groups, dropping the storage from 200 MB raw to ~2 MB output.

Mirrors the geneEffects / cn.bin.gz pipeline in Correlate V2:
- int16 quantisation with a scaleFactor
- NaN encoded as -32768
- gene-major (cache-friendly when slicing all-lines-for-one-gene)
- gzipped

Re-run when Dryad publishes a new release (or when the panel changes).
"""
import csv, gzip, json, os, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, 'doi_10_5061_dryad_b8gtht7g1__v20220815')
OUT_BIN = os.path.join(ROOT, 'web_data', 'tismo_full_expr.bin.gz')
OUT_META = os.path.join(ROOT, 'web_data', 'tismo_full_expr_metadata.json')

# TPM values in Zeng 2022 are quantile-normalised + ComBat-corrected.
# Range observed: ~0 to ~15 (log-scale). scaleFactor 3000 → range
# ±10.92 (sufficient — values rarely exceed 12).
SCALE_FACTOR = 3000
NA_VALUE = -32768

CONDITIONS = ['baseline', 'R', 'NR']
N_COND = len(CONDITIONS)

def parse_phenotype(path):
    """Same shape as the per-panel processor — re-implemented here so
    this script is independent."""
    from collections import defaultdict
    cell_lines = {}
    with open(path) as f:
        rdr = csv.reader(f)
        for i, row in enumerate(rdr):
            if i == 0:
                samples = row[1:]
                continue
            feat = row[0]
            if feat.startswith('Cell_Line_'):
                cl = feat[len('Cell_Line_'):]
                for j, v in enumerate(row[1:]):
                    if v == '1':
                        cell_lines[j] = cl
    return samples, cell_lines

def parse_response(path):
    out = {}
    with open(path) as f:
        rdr = csv.reader(f)
        for i, row in enumerate(rdr):
            if i == 0:
                samples = row[1:]
                continue
            if row[0] not in ('R', 'NR'): continue
            for j, v in enumerate(row[1:]):
                if v == '1':
                    out[j] = row[0]
    return out

def main():
    print('--- pre-ICB cohort ---')
    pre_samples, pre_cl = parse_phenotype(os.path.join(DATA_DIR, 'preICB_phenotype.csv'))
    pre_resp = parse_response(os.path.join(DATA_DIR, 'preICB_response.csv'))
    print(f'  {len(pre_samples)} samples, {len(set(pre_cl.values()))} unique cell lines')

    print('--- post-ICB cohort ---')
    post_samples, post_cl = parse_phenotype(os.path.join(DATA_DIR, 'postICB_phenotype.csv'))
    post_resp = parse_response(os.path.join(DATA_DIR, 'postICB_response.csv'))
    print(f'  {len(post_samples)} samples, {len(set(post_cl.values()))} unique cell lines')

    # Master cell-line list (union of both cohorts).
    cl_set = set(pre_cl.values()) | set(post_cl.values())
    cell_lines = sorted(cl_set)
    cl_to_idx = {cl: i for i, cl in enumerate(cell_lines)}
    n_cl = len(cell_lines)
    print(f'union cell lines: {n_cl}')

    # Stream the expression matrices once to discover the gene list
    # (should be identical between pre and post — sanity-check).
    print('reading pre-ICB expression header...')
    with open(os.path.join(DATA_DIR, 'preICB_exprn.csv')) as f:
        rdr = csv.reader(f)
        pre_hdr = next(rdr)
    print('reading post-ICB expression header...')
    with open(os.path.join(DATA_DIR, 'postICB_exprn.csv')) as f:
        rdr = csv.reader(f)
        post_hdr = next(rdr)
    assert pre_hdr == [''] + pre_samples, f'pre header mismatch ({len(pre_hdr)} vs 1+{len(pre_samples)})'
    assert post_hdr == [''] + post_samples, 'post header mismatch'

    # Initial pass to count genes.
    print('counting genes...')
    n_genes = 0
    with open(os.path.join(DATA_DIR, 'preICB_exprn.csv')) as f:
        rdr = csv.reader(f)
        next(rdr)
        for row in rdr:
            if row and row[0]: n_genes += 1
    print(f'  {n_genes} genes')

    # Build the output tensor as a flat array — gene-major.
    # Layout: data[gi * n_cl * N_COND + ci * N_COND + cond_idx]
    sums = np.zeros((n_genes, n_cl, N_COND), dtype=np.float64)
    counts = np.zeros((n_genes, n_cl, N_COND), dtype=np.int32)
    gene_syms = []

    # Pre-build sample-idx → (cl_idx, cond_idx) maps so the per-row
    # iteration is cheap.
    def build_sample_map(samples, cl_map, resp_map, default_cond):
        m = []  # idx into samples → (cl_idx, cond_idx) or None
        for j, _ in enumerate(samples):
            cl = cl_map.get(j)
            if not cl: m.append(None); continue
            cli = cl_to_idx.get(cl)
            if cli is None: m.append(None); continue
            if default_cond is not None:
                cond_idx = default_cond
            else:
                lbl = resp_map.get(j)
                if lbl == 'R':   cond_idx = CONDITIONS.index('R')
                elif lbl == 'NR': cond_idx = CONDITIONS.index('NR')
                else: m.append(None); continue
            m.append((cli, cond_idx))
        return m
    pre_map = build_sample_map(pre_samples, pre_cl, pre_resp,
                                default_cond=CONDITIONS.index('baseline'))
    post_map = build_sample_map(post_samples, post_cl, post_resp,
                                default_cond=None)
    print(f'  pre samples mapped: {sum(1 for x in pre_map if x)} / {len(pre_map)}')
    print(f'  post samples mapped: {sum(1 for x in post_map if x)} / {len(post_map)}')

    def accumulate(path, sample_map, label):
        print(f'streaming {label}...')
        with open(path) as f:
            rdr = csv.reader(f)
            next(rdr)
            gi = 0
            for row in rdr:
                if not row or not row[0]: continue
                if len(gene_syms) <= gi: gene_syms.append(row[0])
                for j, m in enumerate(sample_map):
                    if m is None: continue
                    s = row[j + 1]
                    if not s: continue
                    try:
                        v = float(s)
                    except ValueError:
                        continue
                    cli, cond = m
                    sums[gi, cli, cond] += v
                    counts[gi, cli, cond] += 1
                gi += 1
                if gi % 2000 == 0:
                    print(f'   {gi}/{n_genes}')
        print(f'  done — genes seen {gi}')

    accumulate(os.path.join(DATA_DIR, 'preICB_exprn.csv'), pre_map, 'preICB_exprn.csv')
    accumulate(os.path.join(DATA_DIR, 'postICB_exprn.csv'), post_map, 'postICB_exprn.csv')

    # Compute means; cells with count 0 → NaN.
    means = np.full_like(sums, np.nan, dtype=np.float32)
    nz = counts > 0
    means[nz] = (sums[nz] / counts[nz]).astype(np.float32)
    valid = ~np.isnan(means)
    print(f'valid entries: {valid.sum():,} / {means.size:,}')
    print(f'  min={np.nanmin(means):.3f} max={np.nanmax(means):.3f}')

    # Quantise int16
    q = np.full(means.shape, NA_VALUE, dtype=np.int16)
    q[valid] = np.clip(np.round(means[valid] * SCALE_FACTOR).astype(np.int32), -32767, 32767).astype(np.int16)

    # Flatten gene-major: gene-major already since dim0 is gene.
    flat = q.flatten()
    print(f'writing {OUT_BIN}...')
    with gzip.open(OUT_BIN, 'wb') as f:
        f.write(flat.tobytes())
    size_mb = os.path.getsize(OUT_BIN) / (1024 * 1024)
    print(f'  size: {size_mb:.2f} MB')

    meta = {
        '_doc': 'Per-cell-line × per-condition mean expression from the Dryad TISMO companion data (Zeng 2022). Tensor shape [nGenes × nCellLines × 3] where 3 = [baseline, R, NR]. Int16 with scaleFactor and -32768 for NaN. Gene-major flattening: idx = gi * nCellLines * 3 + ci * 3 + cond.',
        'source': {
            'name': 'TISMO / Dryad (Zeng 2022)',
            'doi': '10.5061/dryad.b8gtht7g1',
            'url': 'https://datadryad.org/dataset/doi:10.5061/dryad.b8gtht7g1'
        },
        'genes': gene_syms,
        'cellLines': cell_lines,
        'conditions': CONDITIONS,
        'nGenes': len(gene_syms),
        'nCellLines': n_cl,
        'nConditions': N_COND,
        'scaleFactor': SCALE_FACTOR,
        'naValue': NA_VALUE
    }
    with open(OUT_META, 'w') as f:
        json.dump(meta, f, indent=1)
    print(f'  metadata: {OUT_META} ({os.path.getsize(OUT_META)} bytes)')

if __name__ == '__main__':
    main()
