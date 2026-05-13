# MouseCLB — punch list

Resume point after v0.14. Sources currently feeding the app: MCCA
(metadata + WES mutations), Cellosaurus (RRID + synonyms + cautions +
distributor xrefs), TISMO API (sample-level richness + GEO links),
TISMO/Dryad / Zeng 2022 (114-gene immune panel × baseline/R/NR for
22 lines), PubMed (literature presence), primary literature (8 deep
curated workhorses).

## Quick wins (~30-60 min each)

- [ ] **Filter chip**: "Has TISMO immune-panel data" (22 lines). Small
      UI add; lets users narrow to lines with the richest immune data.
- [ ] **Default-expand Checkpoint + IFN-γ** in the immune panel — the
      two most-asked-about groups. Other groups stay collapsed.
- [ ] **Immune-summary tag in list row**: small pill showing PD-L1
      tertile (HIGH/MID/LOW vs cohort) for lines with TISMO data, so
      you can scan PD-L1-high candidates without opening each.
- [ ] **List-row TMB tag** showing HIGH-impact-count tertile for MCCA
      lines with WES data.
- [ ] **CURATED_CELL_LINES.md refresh** — it's still v0.1 era; update
      to reflect the 22 TISMO-covered + 8 literature + 590 MCCA lines.
- [ ] **README sources table refresh** — sync with v0.14 contents.

## Medium (1-3 h each)

- [ ] **Composite immune-signature scores** per cell line: T-cell-
      inflamed (Ayers/IFN-γ), MDSC score, M1/M2 ratio, MHC-I score,
      Pole/MMR-deficient signature. Single number per line →
      sortable, comparable across cohort. Sort options:
      "Sort: T-cell-inflamed score", "Sort: MDSC score", etc.
- [ ] **Compare two cell lines side-by-side**: pick two from the list,
      detail pane splits and highlights differences. The most-asked
      view for "should I use line A or line B?"
- [ ] **Bar-chart / heatmap visualization** for the immune panel (pure
      SVG, no library). Current table is information-dense; visual
      gives a faster scan. Per-group sparkline ideally.
- [ ] **Unified "Drivers" schema**: map MCCA WES driver-panel hits
      onto the same shape as literature `drivers` arrays, so the
      "Driver mutations" section reads consistently regardless of
      source. Currently MCCA hits are shown in a separate section.

## Heavier (a session each)

- [ ] **Per-gene expression browser**: given the 22-line TISMO panel
      data, allow the user to type any gene name and see a bar chart
      across the 22 lines × 3 conditions. Like Correlate V2's gene-
      search UI but bounded to immune panel + ICB context. To support
      arbitrary genes we'd need to also process the full Dryad
      expression matrix (currently we keep only the 114-gene panel)
      — option: keep the full matrix in a binary blob, gzipped,
      loaded on demand.
- [ ] **"Pick the right model" decision tree**: given user goal
      (e.g. "ICB-responsive HNSCC", "cold KRAS-mutant lung",
      "high-TMB colon"), narrow to candidate lines with reasons. The
      app currently has the data; this is a guided-UX layer on top.
- [ ] **Mosely 2017 supplementary tables**: their TMB / TIL density /
      MDSC ratio / anti-PD-L1 efficacy data for all ~22 lines in
      their cohort (not just our 8). Probably PDF/Excel from the
      paper supplement — needs manual extraction.

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
