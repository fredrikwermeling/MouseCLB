# Curated mouse cancer cell lines

The hand-curated workhorse panel for MouseCLB. These lines get the deepest
treatment in the browser: literature-curated immune profile, driver
mutations, distributor cross-refs, and per-line cautions.

Other lines (the ~590 MCCA-bulk set, plus the wider TISMO cohort) get the
data layers their source provides, but no hand-curated annotations.

## Currently curated (8 lines — `literature_lines.json`)

Each is sourced from primary literature (PMID linked in the app) plus
Cellosaurus identity and TISMO/Dryad data where covered.

| Line | RRID | Strain | Cancer | TMB | MSI | Phenotype | ICB | TISMO |
|---|---|---|---|---|---|---|---|---|
| **MC38** | CVCL_B288 | C57BL/6 | Colon adenocarcinoma | high | high | hot | responsive | ✓ |
| **LL/2 (LLC1)** | CVCL_4358 | C57BL/6 | Lung carcinoma | low | stable | cold | resistant | ✓ |
| **Panc02** | CVCL_D627 | C57BL/6 | Pancreatic ductal adeno | high | stable | variable | partial | ✓ |
| **MOC1** | CVCL_ZD32 | C57BL/6 | HNSCC | high | stable | inflamed | responsive | ✓ |
| **MOC2** | CVCL_ZD33 | C57BL/6 (Cxcr3-/-) | HNSCC | medium | stable | cold | resistant | ✓ |
| **ID8** | CVCL_IU14 | C57BL/6 | Ovarian surface epithelial | low | stable | cold | resistant | ✓ |
| **TC-1** | CVCL_4699 | C57BL/6 | HPV-E6/E7 + H-Ras (lung-derived) | low | stable | variable | partial | — |
| **B16-F1** | CVCL_0158 | C57BL/6 | Cutaneous melanoma | low | stable | cold | resistant | — |

These cover the canonical immune-spectrum axes from hot/responsive (MC38,
MOC1) through variable/partial (Panc02, TC-1) to cold/resistant (LL/2, MOC2,
ID8, B16-F1).

## TISMO-covered (22 lines — `tismo_immune_panel.json`)

These get the full 114-gene immune panel + composite signature scores +
per-gene expression search. Includes the 8 curated workhorses above plus:

402230, 4T1, 6419c5, AB1, B16, BNL-MEA, CT26, D3UV2, D4M.3A.3, E0771,
EMT6, KPB25L, Renca, T11, YTN16, YTN2, YUMM1.7, p53-2225L, p53-2336R.

## MCCA-bulk (590 lines — `metadata.json`)

The full MCCA cohort: identity, lineage, mouse-model genotype, MHC haplotype,
host strain, plus WES mutation calls for 174 of them (`mutations.json`).
Heavily KRAS-GEMM-biased (~83% epithelial, mostly pancreatic / lung /
intestinal GEMMs). The carcinogen-induced workhorses (MC38, LL/2, Panc02,
MOC1/2, ID8, TC-1, B16-F1) are NOT in MCCA — they enter MouseCLB through
the literature-curated set above instead.

34 MCCA lines also have full Cellosaurus enrichment (RRID + synonyms +
cautions + distributor cross-refs) — mostly the canonical lines that
overlap with the literature panel (4T1, CT26, EMT6, A20, EL4, Hepa1-6,
RenCa, YAC-1, 67NR, etc.).

## Notable gaps

Worth manually curating in a future release:

- **GL261** (glioma, C57BL/6) — popular CNS model, not in MCCA, partial TISMO.
- **MB49** (bladder, C57BL/6) — partial TISMO.
- **KPC family** (Kras-G12D / Trp53 R172H GEMM pancreatic) — many in MCCA
  but not consolidated into a single curated entry.
- **AT-3** (mammary, MMTV-PyMT-derived) — common but unannotated.
- **B16-F10** (most-used B16 sub-line) — covered through the B16 parent in
  TISMO but the F10-specific metastatic biology isn't surfaced separately.
- **Engineered derivatives** (B16-OVA, MC38-Luc, MC38-CD274-KO, etc.) —
  Cellosaurus catalogues these but we don't list them separately yet.

## Data-source caveats

- **MCCA** is heavily GEMM-flavoured. For carcinogen-induced or
  spontaneous-origin workhorses, the literature-curated entries above are
  the only source.
- **TISMO bulk download API** is broken — the data file ships from Dryad
  (Zeng 2022, doi:10.5061/dryad.b8gtht7g1) instead.
- **Cellosaurus RRIDs** are universal but STR profiles are sparse for mouse
  lines (Cellosaurus has ~141 mouse-line STR profiles total).
- **Mosely 2017** (Cell Reports, PMID 28768203) characterised TMB / TIL
  density / anti-PD-L1 efficacy for ~16 syngeneic lines. Their supplementary
  tables are the canonical reference for these metrics and are queued for
  manual extraction in TODO.md.
