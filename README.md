# MouseCLB — Mouse Cancer Cell Line Browser

**Live app:** https://fredrikwermeling.github.io/MouseCLB/

A unified, browsable view of commonly-used mouse cancer cell lines, aggregating
identity, genome, immune-profile, and literature data from across the public web.
Each datum is linked back to its primary source so you can verify or dig deeper.

## What it does

MouseCLB doesn't generate data — it stitches together what already exists on the
public web for each cell line, into one consistent detail page. There is no
DepMap-equivalent for mouse cancer cell lines, so the information for any one
line is scattered across multiple databases and primary papers. MouseCLB pulls
those threads together.

## Data sources

| Source | Coverage | What we pull | Link in app |
|---|---|---|---|
| [MCCA](https://www.mcca.tum.de) (Mouse Cancer Cell Line Atlas, Rad lab, *Nat Genet* 2025/26) | 590 lines, heavily KRAS-GEMM | identity, lineage, mouse-model genotype, MHC haplotype, host strain | source name on each row |
| [Cellosaurus](https://www.cellosaurus.org) | universal | RRID, synonyms, NCIt disease, cautions, alternate names | RRID link to Cellosaurus page |
| [TISMO](https://tismo.pku-genomics.org) (Tumor Immune Syngeneic MOuse) | 92 syngeneic lines with RNA-seq + ICB-treatment context | sample counts, host strain options, drug-arm catalog, GEO accessions for raw data | clickable GEO links per study |
| Primary literature (PubMed) | targeted for ~8 curated workhorses (MC38, LL/2, Panc02, MOC1, MOC2, ID8, TC-1, B16-F1) | driver mutations, immune profile (TMB / MSI / phenotype / ICB response), known caveats | citation + PMID link |

Each cell line in the browser shows a "Data from" chip row at the top of its
detail pane listing exactly which sources contributed to its profile, with
links to each one.

## Why this exists

Mouse cancer cell lines are the workhorses of preclinical immuno-oncology, but
the information you need to pick the right model for a study — host strain,
TMB, immune phenotype, ICB responsiveness, driver mutations, known variant
heterogeneity between labs — is spread across half a dozen databases and
dozens of primary papers. MouseCLB collapses that into one detail page per
line with explicit provenance, so a researcher doesn't have to open eight tabs
to compare two candidate models.

## Coverage today (v0.8)

- ~600 cell lines total
- 92 with TISMO sample-count + GEO-accession indexing
- 8 with deep curated literature profiles (driver mutations + immune profile)
- 34 with full Cellosaurus identity records (RRID, synonyms, cautions)

## Repo layout

```
MouseCLB/
  index.html              single-page app
  app.js                  all logic
  web_data/               source-of-truth data files
    metadata.json          (MCCA bulk metadata)
    literature_lines.json  (hand-curated workhorses from primary lit)
    mcca_cellosaurus.json  (Cellosaurus enrichment, batched API fetch)
    tismo_enrichment.json  (TISMO API fetch — sample counts + GEO links)
  scripts/                python data-acquisition pipelines
    process_mcca_metadata.py
    enrich_with_cellosaurus.py
    build_tismo_enrichment.py
  CURATED_CELL_LINES.md   the target workhorse list + provenance notes
  README.md
```

All scripts under `scripts/` are independently re-runnable against their public
API or static-file source.

## Status

Pre-alpha. The data layer is steadily widening. Next priorities: PubMed
literature-presence counts per line, and a real expression layer (either by
processing MCCA's downloadable expression matrices or by harmonising the
per-study GEO data underlying TISMO).
