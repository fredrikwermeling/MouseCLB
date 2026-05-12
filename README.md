# MouseCLB — Mouse Cancer Cell Line Browser

A standalone web app for browsing commonly-used mouse cancer cell lines.
Same visual / interaction language as Correlate V2's Cell Line Browser, but a
distinct product — focused on a curated set of mouse cell lines instead of the
~1100-line DepMap human atlas.

## Why this exists

There is no DepMap-equivalent for mouse cancer cell lines. The closest
public resources are:

- **MCCA (Mouse Cancer Cell Line Atlas)** — Rad lab, *Nature Genetics* 2025/26.
  590 multi-omic profiled lines, but heavily KRAS-GEMM biased (~91 %
  GEMM-derived; missing carcinogen-induced workhorses like MC38 / LLC / Pan02 / MOC1).
- **TISMO** — 49 in-vitro + 68 in-vivo syngeneic immuno-oncology models with
  RNA-seq and ICB treatment context, but no mutations or CN.
- **Cellosaurus** — identity / RRID, only 141 mouse lines have STR profiles.
- **Individual literature** (Mosely 2017 Cell Reports and similar) — point-data
  for the carcinogen-induced lines.

MouseCLB stitches these together into one curated browser focused on the
~30-50 cell lines that mouse cancer researchers actually use day-to-day.

## Scope (v0.1)

- **In:** identity / origin / lineage, mutations (where available), copy number
  (where available), gene expression, FACS-relevant surface markers, executive
  summary, Wiki modal with sectioned deep-dive, collections panel with
  oncoprint-style include/exclude.
- **Out:** network / correlation / cluster analysis modes (the Correlate /
  CoExpress / V2 stack handles those for human; for mouse the dataset is too
  small to make those analyses interesting). CRISPR dependencies and PRISM
  drug-response sections (data doesn't exist at scale for mouse).

## Data layout

```
MouseCLB/
  index.html              single-page app
  app.js                  all logic (mirrors Correlate V2 patterns)
  web_data/               processed JSON / binary data files
    metadata.json
    mutations.json
    cn.json
    expression.bin.gz
    expression_genes.json
    pathway_panels.json
    facs_markers.json
    cellosaurus_rrid.json
  scripts/                Python data-processing pipeline
    process_mcca_metadata.py
    process_mcca_mutations.py
    process_mcca_cn.py
    process_mcca_expression.py
    ...
  CURATED_CELL_LINES.md   the target cell-line list + per-line data sources
  README.md
```

## Data sources

| Source | URL | License | Used for |
|---|---|---|---|
| MCCA | https://www.mcca.tum.de | CC-BY (paper) | mutations, CN, expression, metadata |
| TISMO | http://tismo.cistrome.org | free use | RNA-seq + immune context for MC38 / LLC / Pan02 / MOC1 / E0771 / KPC |
| Cellosaurus | https://www.cellosaurus.org | CC-BY | identity / RRID / authentication links |
| Mosely 2017 (PMID 28768203) | Cell Reports | publisher | mutation / CN for the carcinogen-induced canonical lines |

## Status

Pre-alpha. Building the data-processing pipeline. See `MOUSE_CORRELATE_PLAN.md`
in the correlate-v2 repo for the design rationale and source landscape.
