# MouseCLB — punch list

Resume point after v0.20. Sources currently feeding the app: MCCA
(metadata + WES mutations), Cellosaurus (RRID + synonyms + cautions +
distributor xrefs), TISMO API (sample-level richness + GEO links),
TISMO/Dryad / Zeng 2022 (114-gene immune panel + full 15.4k-gene
expression matrix × baseline/R/NR for 22 lines), PubMed (literature
presence), primary literature (8 deep curated workhorses).

## Shipped between v0.15 and v0.22

- ✅ Per-gene expression browser (full Dryad matrix, 1.7 MB binary blob,
  v0.15) — gene-search UI + cohort-dotplot per condition.
- ✅ Composite immune-signature scores (T-cell inflamed / MHC-I / MHC-II
  / MDSC / M1-M2) with bar viz + sort options (v0.16).
- ✅ Compare two cell lines side-by-side (v0.17) — pin button, banner,
  3-col difference-highlighted table.
- ✅ TISMO-covered & literature-curated subset filters (v0.18).
- ✅ Default-expand Checkpoint + IFN-γ + per-group panel-mean strip
  plot (v0.19).
- ✅ Unified Drivers schema — literature + MCCA WES merged into one
  table with source badges (v0.20).
- ✅ PD-L1 ↑/↓ and TMB ↑/↓ tertile tags in list rows (v0.21) — silent
  for mid-tertile to keep rows scannable.
- ✅ "Pick a model" guided picker (v0.22) — 5 preset goals
  (ICB-responsive / cold-resistant / high-TMB / PD-L1-high / MHC-I-loss),
  lineage filter, ranked candidates with match-reason explanations.
- ✅ README + CURATED_CELL_LINES.md refreshed (v0.23) to reflect the
  full v0.22 feature set and current data coverage.

## Heavier still open

- [ ] **Mosely 2017 supplementary tables**: their TMB / TIL density /
      MDSC ratio / anti-PD-L1 efficacy data for all ~22 lines in
      their cohort (not just our 8). Probably PDF/Excel from the
      paper supplement — needs manual extraction.
- [ ] **Refine model-picker scoring**: the v0.22 scoring is heuristic
      (literal points per matching criterion). Worth iterating on the
      weights once a user has spent time with it — particularly the
      "high-TMB" goal (which currently rewards Pole / MMR-deficient
      annotations) and the "ICB-resistant" goal.

## Sources not yet tried (worth probing)

- [ ] **ARCHS4** (https://maayanlab.cloud/archs4/) — preprocessed
      mouse RNA-seq archive, may cover lines not in TISMO.
- [ ] **Synapse** (Sage Bionetworks) — sometimes hosts mouse cancer
      model data. Worth a search.
- [ ] **ImmuneSpace** / **OMiCC** — possibly has mouse syngeneic
      studies with immune profiling.
- [ ] **TISMO ML paper supplementary signature scores** — they
      computed signatures we may be able to ingest directly instead
      of recomputing from raw expression.

## Sources tried and rejected (for reference, don't redo)

- ~~Wikipedia~~ — sparse coverage (4T1, B16, L1210 only), low yield
  per query (v0.11 removed it).
- ~~Sanger Cell Model Passport~~ — zero Mus musculus lines in their
  CSV (human-only resource).
- ~~MGI Mouse Genome Informatics~~ — gene/strain-centric, not
  cell-line-centric.
- ~~TISMO bulk-download API~~ — all `/download/*` endpoints return
  404; Dryad is where the data actually lives.

## Polish / hygiene

- [ ] Screenshots in README so the github landing page sells the app.
- [ ] An in-app changelog modal (like Correlate V2's version-badge
      click) so users see what's new without reading commit messages.
- [ ] CN file (`MCCA-CopyNumberVariants-2025Q3.xlsx`, 2.9 MB local)
      processor — port the mutations.py pattern. MCCA-flavoured data,
      so deprioritise if the focus has shifted away from MCCA.
- [ ] **MCCA expression file** (92 MB local) deferred — the user noted
      MCCA is KRAS-GEMM-biased and less interesting; the 22-line
      TISMO panel covers the actually-used workhorses with richer
      immune context, so this is low priority.

## Architecture notes

- Each source has its own enrichment file in `web_data/` so re-runs
  are independent. Don't merge them into one mega-file.
- Each cell line's `meta.sources[cl]` array is the canonical
  provenance record. New sources should add a chip entry.
- The Dryad raw folder (`doi_10_5061_dryad_b8gtht7g1__v20220815/`) is
  `.gitignored` — anyone running the data scripts needs to download
  it from Dryad first (one-click from the dataset page).
