# MouseCLB — Mouse Cancer Cell Line Browser

**Live app:** https://fredrikwermeling.github.io/MouseCLB/

A unified, browsable view of commonly-used mouse cancer cell lines, aggregating
identity, genome, immune-profile, and literature data from across the public web.
Each datum is linked back to its primary source so you can verify or dig deeper.

## What it does

MouseCLB doesn't generate data — it stitches together what already exists on the
public web for each cell line into one consistent detail page. There is no
DepMap-equivalent for mouse cancer cell lines, so the information for any one
line is scattered across multiple databases and primary papers. MouseCLB pulls
those threads together.

## Data sources

| Source | Coverage | What we pull | Link in app |
|---|---|---|---|
| [MCCA](https://www.mcca.tum.de) (Mouse Cancer Cell Line Atlas) | 590 lines, heavily KRAS-GEMM | identity, lineage, mouse-model genotype, MHC haplotype, host strain, WES mutation calls | source name on each row |
| [Cellosaurus](https://www.cellosaurus.org) | universal | RRID, synonyms, NCIt disease, cautions, distributor cross-refs (ATCC / Kerafast / Sigma / etc.) | RRID link to Cellosaurus page + per-provider product links |
| [TISMO](https://tismo.pku-genomics.org) (Tumor Immune Syngeneic MOuse) | 92 syngeneic lines with RNA-seq + ICB-treatment context | sample counts, host strain options, drug-arm catalog, GEO accessions | clickable GEO links per study |
| [TISMO / Dryad](https://datadryad.org/dataset/doi:10.5061/dryad.b8gtht7g1) (Zeng 2022 companion data) | 22 of the TISMO lines with R / NR / Baseline labels | 114-gene immune panel + full 15.4 k-gene expression matrix per cell line × condition | inline panel + per-gene search |
| [PubMed (NCBI E-utilities)](https://eutils.ncbi.nlm.nih.gov/) | 591 lines | literature-presence count per line (disambiguated by "mouse" + "cancer" tokens) | clickable PubMed search URL |
| Primary literature | 8 deep-curated workhorses (MC38, LL/2, Panc02, MOC1, MOC2, ID8, TC-1, B16-F1) | driver mutations, immune profile (TMB / MSI / phenotype / ICB response), known caveats | citation + PMID link |

Each cell line shows a "Data from" chip row at the top of its detail pane,
listing exactly which sources contributed to its profile.

## Headline features (v0.22)

- **Per-line detail card** with sectioned sections: Cancer classification ·
  Mouse model · Clinical & genome · Driver mutations (literature + MCCA WES
  merged with source badges) · Immune context · Immune gene panel (TISMO) ·
  Composite immune-signature scores · Expression search · TISMO record · Culture
  & source · Literature presence.
- **Immune signature scores** per cell line (where TISMO covers it): T-cell-
  inflamed (Ayers-like), MHC-I, MHC-II, MDSC / suppression, M1−M2 macrophage
  polarisation. Rendered as a horizontal-bar table; also sortable directly from
  the list.
- **Per-gene expression search** (TISMO-covered lines): type any of the
  15 390 genes in the Dryad expression matrix and see this line's
  baseline / R / NR values plotted on the cohort dot-strip.
- **Compare two cell lines side-by-side**: pin two lines, click "Compare these
  two →" — detail pane becomes a 3-column table highlighting rows that differ.
- **"Pick a model" guided picker** — 5 preset goals (ICB-responsive · ICB-
  resistant cold · high-TMB · PD-L1 high · MHC-I loss), optional lineage
  filter, ranked candidates with match reasons.
- **List-row tags**: PD-L1 ↑/↓ and TMB ↑/↓ tertile pills so you can scan
  candidates without opening each card. The two TISMO sort options surface
  immune-data lines together.

## Repo layout

```
MouseCLB/
  index.html              single-page app
  app.js                  all logic (single IIFE, no build step)
  TODO.md                 punch list / resume notes
  CURATED_CELL_LINES.md   target workhorse list + provenance
  README.md
  web_data/                          shipped data files
    metadata.json                    MCCA bulk metadata
    literature_lines.json            8 hand-curated workhorses
    mcca_cellosaurus.json            Cellosaurus enrichment for matched MCCA lines
    tismo_enrichment.json            TISMO API fetch (per-line sample counts + GEO)
    tismo_immune_panel.json          114-gene immune panel × baseline/R/NR × 22 lines
    tismo_full_expr.bin.gz           15 390-gene × 22-line × 3-condition matrix (1.7 MB int16)
    tismo_full_expr_metadata.json    matrix metadata
    pubmed_presence.json             per-line PubMed literature counts
    mutations.json                   MCCA WES driver-panel hits
  scripts/                python data-acquisition pipelines
    process_mcca_metadata.py
    process_mcca_mutations.py
    enrich_with_cellosaurus.py
    enrich_with_pubmed.py
    build_tismo_enrichment.py
    process_tismo_dryad.py           114-gene immune panel
    process_tismo_full_expression.py full 15 k-gene matrix
```

All scripts under `scripts/` are independently re-runnable against their public
API or static-file source. None of the raw input data is committed — the Dryad
folder is `.gitignored`, the MCCA xlsx files are external. The processed
output JSONs / binary blobs are the only data that ships.

## Status

Pre-alpha but feature-complete on the major axes. See `TODO.md` for the
remaining punch list (mostly Mosely-2017 supplementary extraction and
score-weight refinement on the picker).
