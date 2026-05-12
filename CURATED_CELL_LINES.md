# Curated mouse cancer cell lines

This is the target list for MouseCLB v0.1. Each line is annotated with:
- Background strain
- Cancer type
- Primary use case
- Data sources where the line is covered

Tier 1 = "I cannot ship a mouse CLB without this line." Tier 2 = "common
enough that researchers will look for it but not strictly required for v0.1."

## Tier 1 — must-have (~20 lines)

| Line | Strain | Cancer | Primary use | MCCA | TISMO | Mosely | Notes |
|---|---|---|---|---|---|---|---|
| B16-F10 | C57BL/6 | Melanoma | ICB / immuno-onc | ✓ (as B16-F10M) | ✓ | ✓ | Most commonly used immuno-oncology model |
| MC38 | C57BL/6 | Colon adeno | ICB / immuno-onc | ✗ | ✓ | ✓ | DMH-induced; MSS but ICB-responsive |
| CT26 | BALB/c | Colon | ICB / immuno-onc | ✓ | ✓ | ✓ | NMU-induced; classic ICB-responder |
| 4T1 | BALB/c | Mammary | Metastasis biology | ✓ | ✓ | ✓ | Spontaneous; triple-neg-like; metastasises spontaneously |
| LL/2 (LLC) | C57BL/6 | Lung carcinoma | Lung onc / immuno-onc | ✗ | ✓ | ✓ | Spontaneous; widely-used lung model |
| EMT6 | BALB/c | Mammary | Immuno-onc | ✓ | ✓ | ✓ | Less aggressive than 4T1 |
| Renca | BALB/c | Renal carcinoma | RCC immuno-onc | ✓ | ✓ | ✓ | Spontaneous |
| Pan02 (PANC02) | C57BL/6 | Pancreatic | Pancreatic immuno-onc | ✗ | ✓ | ✓ | 3-MCA-induced; KRAS-WT contrast to GEMMs |
| EL4 | C57BL/6 | T-cell lymphoma | Lymphoid biology | ✓ | (in-vivo) | ✓ | DMBA-induced |
| Hepa1-6 | C57BL/6 | Liver | HCC immuno-onc | ✓ (HEPA1-6) | ✓ | ✓ | Spontaneous HCC |
| E0771 (EO771) | C57BL/6 | Mammary | Breast immuno-onc | ? | ✓ | ✓ | C57BL/6 mammary alternative to 4T1 |
| MOC1 | C57BL/6 | HNSCC | Head & neck immuno-onc | ✗ | ✓ | ? | 4-NQO-induced |
| MOC2 | C57BL/6 | HNSCC | HNSCC, more aggressive than MOC1 | ✗ | ✓ | ? | Companion to MOC1 |
| A20 | BALB/c | B-cell lymphoma | B-cell immunology / CAR-T | ✓ | — | — | Spontaneous |
| KPC (KPC-1 etc.) | C57BL/6 | Pancreatic GEMM | KRAS-driven PDAC | ✓ (many) | ✓ | — | Kras G12D / Trp53 R172H GEMM |
| YAC-1 (YAC1) | A/Sn | T-cell lymphoma | NK-cell assays (canonical target) | ✓ | — | — | Moloney-virus-induced |
| ID8 | C57BL/6 | Ovarian | Ovarian immuno-onc | ? | ✓ | ? | Spontaneous epithelial |
| TC-1 | C57BL/6 | Lung (HPV-transformed) | HPV vaccine / immuno-onc | ✗ | ? | ? | E6/E7 + Ras transfected |
| B16-F1 | C57BL/6 | Melanoma | Less metastatic B16 variant | ? | — | ✓ | Parental of B16-F10 |
| 67NR | BALB/c | Mammary | Non-metastatic 4T1 sibling | ✓ | — | — | Useful 4T1 metastasis-control |

## Tier 2 — desirable (~10-15 lines)

| Line | Strain | Cancer | Use | Sources |
|---|---|---|---|---|
| 4T07 | BALB/c | Mammary | Intermediate-metastatic 4T1 sibling | MCCA |
| 168FARN | BALB/c | Mammary | Lymph-node-restricted 4T1 sibling | MCCA |
| AT-3 | C57BL/6 | Mammary | MMTV-PyMT-derived | ? |
| Lewis Lung Carcinoma variants | C57BL/6 | Lung | Multiple LLC sub-lines | ✗ (LLC) |
| RM-1 / RM-9 | C57BL/6 | Prostate | Prostate cancer | ? |
| GL261 | C57BL/6 | Glioma | CNS immuno-onc | ? |
| MB49 | C57BL/6 | Bladder | Bladder cancer | ? |
| B16-OVA | C57BL/6 | Melanoma | Engineered for OT-I / OT-II studies | — (engineered) |
| KP cell lines (Kras G12D / Trp53 lung) | C57BL/6 | Lung GEMM | KP lung GEMM-derived lines | MCCA (probably) |
| AB1 | BALB/c | Mesothelioma | Mesothelioma immuno-onc | ? |

## Tier 3 — defer to later release

- Strain-specific GEMM-derived lines for niche tissues (intestine, bile duct,
  esophagus): MCCA has plenty of these (~588 total) but they are not in common
  daily use outside the originating labs.
- Engineered derivative lines (B16-OVA, MC38-Luc, etc.) — annotation but not
  unique genomic data; flag from a parent.

## Data-source notes

- **MCCA covers** ~17 of the Tier 1 + 2 lines directly. The Wildtype subset
  (n = 57) is where the carcinogen-induced / spontaneous canonical lines sit.
  MCCA's strength is the GEMM-derived KPC pancreatic and KP lung lines.
- **MCCA misses** the carcinogen-induced workhorses: MC38, LLC, Pan02, MOC1/2,
  TC-1, B16-F1, AT-3, RM-1/9, GL261, MB49, AB1.
- **TISMO covers** 49 syngeneic lines in vitro and adds the in-vivo / ICB
  treatment context. Most of the MCCA gaps are filled here for RNA-seq, but
  TISMO has no mutations or CN.
- **Mosely et al. 2017** (Cell Reports, PMID 28768203) — "Recurrent
  Patterns of Mutation, Copy Number, and Expression in Tumor Models" —
  characterised B16-F10, 4T1, LL/2, MC38, CT26, RENCA, EMT6, Pan02 with WES
  / RNA-seq / CN microarray. Key reference for the carcinogen-induced lines
  that MCCA misses.
- **Cellosaurus** has identity / RRID for all of these. STR profile only for
  a few (B16 family, CT26, 4T1).

## Build order

1. MCCA-covered Tier 1 first (B16, CT26, 4T1, EMT6, Renca, EL4, Hepa1-6, A20,
   YAC-1, KPC family). These get the full data layers (mutations, CN,
   expression, metadata).
2. TISMO supplement for missing Tier 1 (MC38, LLC, Pan02, MOC1/2, E0771).
   These get expression + immune profile + ICB context. Mutations / CN listed
   as "from literature" with a curated minimal panel.
3. Mosely 2017 supplement for genomic data on MC38 / LLC / Pan02. If we can
   re-process their VCFs / CN segments, the Tier 1 picture is much more
   complete.
4. Tier 2 added later.
