// MouseCLB — Mouse Cancer Cell Line Browser
// v0.2 — V2-CLB-style layout: filter bar (lineage / cancer type / model
// type / sex / tier), sort dropdown, sex glyph in each row, sectioned
// detail pane (Cancer classification → Identity → Mouse model →
// Clinical & genome → Immune context → Culture). Still identity-only;
// mutations / CN / expression sections will arrive once the matching
// data-processing scripts land.

(async function main() {
  const META_URL = 'web_data/metadata.json';
  const LIT_URL  = 'web_data/literature_lines.json';
  const MCCA_CELLO_URL = 'web_data/mcca_cellosaurus.json';
  const TISMO_URL = 'web_data/tismo_enrichment.json';
  const PUBMED_URL = 'web_data/pubmed_presence.json';
  const MUT_URL = 'web_data/mutations.json';
  const IMMUNE_URL = 'web_data/tismo_immune_panel.json';
  const FULL_EXPR_BIN_URL = 'web_data/tismo_full_expr.bin.gz';
  const FULL_EXPR_META_URL = 'web_data/tismo_full_expr_metadata.json';

  // ---------- load ----------
  let meta;
  try {
    const r = await fetch(META_URL);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    meta = await r.json();
  } catch (e) {
    document.getElementById('cl-list').innerHTML =
      `<div class="empty" style="color:#991b1b;">Failed to load <code>${META_URL}</code>: ${e.message}.<br>Run <code>scripts/process_mcca_metadata.py</code> first.</div>`;
    return;
  }

  // MouseCLB aggregates per-line info from multiple public web sources.
  // Each cell line ends up with a `sources` array describing which
  // sources contributed data, with URLs. No one source is "primary";
  // lines may have one or many sources depending on coverage.
  if (!meta.litCitation) meta.litCitation = {};
  if (!meta.cellosaurusRrid) meta.cellosaurusRrid = {};
  if (!meta.synonyms) meta.synonyms = {};
  if (!meta.ncitDisease) meta.ncitDisease = {};
  if (!meta.cautions) meta.cautions = {};
  if (!meta.sources) meta.sources = {};
  if (!meta.providers) meta.providers = {};

  // Bulk metadata for the 590 lines comes from MCCA. Tag them now;
  // additional sources are added as we merge each enrichment file.
  for (const cl of meta.cellLines) {
    meta.sources[cl] = [{
      name: 'MCCA',
      url: 'https://www.mcca.tum.de',
      what: 'bulk metadata (lineage, mouse-model, MHC, host strain)'
    }];
  }

  // Merge in Cellosaurus enrichment for the MCCA lines (built offline by
  // scripts/enrich_with_cellosaurus.py). Only ~34/590 lines match because
  // the MCCA cohort is mostly paper-internal GEMM names, but the matched
  // ones are the canonical workhorses (4T1, CT26, EMT6, A20, EL4, etc.)
  // and getting their RRIDs + synonyms + cautions onto the detail pane
  // is high-value.
  try {
    const er = await fetch(MCCA_CELLO_URL);
    if (er.ok) {
      const enrich = await er.json();
      for (const [cl, v] of Object.entries(enrich.byCellLine || {})) {
        if (!v || !v.rrid) continue;
        meta.cellosaurusRrid[cl] = v.rrid;
        if (Array.isArray(v.synonyms) && v.synonyms.length) meta.synonyms[cl] = v.synonyms;
        if (v.ncitDisease) meta.ncitDisease[cl] = v.ncitDisease;
        if (Array.isArray(v.cautions) && v.cautions.length) meta.cautions[cl] = v.cautions;
        if (Array.isArray(v.providers) && v.providers.length) meta.providers[cl] = v.providers;
        if (!meta.sources[cl]) meta.sources[cl] = [];
        meta.sources[cl].push({
          name: 'Cellosaurus',
          url: `https://www.cellosaurus.org/${v.rrid}`,
          what: 'identity (RRID, synonyms, NCIt disease, cautions)'
        });
      }
    }
  } catch (e) {
    console.warn('Could not load MCCA Cellosaurus enrichment:', e);
  }

  // Merge in TISMO enrichment (sample counts, GEO study IDs, ICB-arm
  // counts). TISMO catalogues 92 syngeneic mouse lines with RNA-seq +
  // ICB context drawn from public studies. We don't ship the raw
  // expression matrix (the TISMO download endpoint returns plot images,
  // not raw data); instead each line gets a "TISMO record" block with
  // sample counts, study accessions, and a link out to the TISMO portal.
  if (!meta.tismo) meta.tismo = {};
  const norm = (s) => (s || '').toLowerCase().replace(/[\s\-_/]/g, '');
  try {
    const tr = await fetch(TISMO_URL);
    if (tr.ok) {
      const td = await tr.json();
      // TISMO keys lines by display name; we need to match by normalized
      // name against meta.names. Build a reverse index once.
      const tismoByNorm = new Map();
      for (const [n, v] of Object.entries(td.byName || {})) tismoByNorm.set(norm(n), { tismoName: n, ...v });
      for (const cl of meta.cellLines) {
        const hit = tismoByNorm.get(norm(meta.names?.[cl] || cl));
        if (hit) {
          meta.tismo[cl] = hit;
          if (!meta.sources[cl]) meta.sources[cl] = [];
          const what = `${hit.vivoSamples || 0} in-vivo / ${hit.vitroSamples || 0} in-vitro samples across ${(hit.studies || []).length} studies`
            + ((hit.icbResponders || 0) + (hit.icbNonResponders || 0) > 0
              ? `; ${hit.icbResponders}R / ${hit.icbNonResponders}NR labelled` : '');
          meta.sources[cl].push({
            name: 'TISMO',
            url: 'https://tismo.pku-genomics.org/#/databrowser',
            what
          });
        }
      }
    }
  } catch (e) {
    console.warn('Could not load TISMO enrichment:', e);
  }

  // PubMed literature-presence counts (NCBI E-utilities). Adds a
  // "PubMed presence" source chip with a link to the disambiguated
  // search results page for each line.
  if (!meta.pubmed) meta.pubmed = {};
  try {
    const pr = await fetch(PUBMED_URL);
    if (pr.ok) {
      const pd = await pr.json();
      for (const [cl, v] of Object.entries(pd.byCellLine || {})) {
        if (!v || typeof v.count !== 'number') continue;
        meta.pubmed[cl] = v;
        if (v.count > 0) {
          if (!meta.sources[cl]) meta.sources[cl] = [];
          meta.sources[cl].push({
            name: 'PubMed',
            url: v.pubmedUrl,
            what: `${v.count} cancer-context paper${v.count === 1 ? '' : 's'}`
          });
        }
      }
    }
  } catch (e) {
    console.warn('Could not load PubMed presence:', e);
  }

  // Driver-mutation calls from MCCA's mutation file. Adds:
  //   meta.mutations[cl] = {totalHigh, totalModerate, driverMuts: [...]}
  // For lines that have any driver-panel hits, also adds a contributor
  // line to meta.sources[cl] so the "Data from" chip row reflects the
  // mutation layer (separate from MCCA's bulk metadata contribution).
  if (!meta.mutations) meta.mutations = {};
  try {
    const mr = await fetch(MUT_URL);
    if (mr.ok) {
      const md = await mr.json();
      for (const [cl, v] of Object.entries(md.byCellLine || {})) {
        meta.mutations[cl] = v;
        // Upgrade the MCCA chip's what-text so users see this line has
        // mutation data alongside metadata.
        const src = (meta.sources?.[cl] || []).find(s => s.name === 'MCCA');
        if (src) src.what = 'metadata + WES mutation calls';
      }
    }
  } catch (e) {
    console.warn('Could not load mutations:', e);
  }

  // TISMO immune-gene panel (mean expression of curated immune-relevant
  // genes per cell line × condition, from the Zeng 2022 Dryad deposition).
  if (!meta.immunePanel) meta.immunePanel = {};
  meta.immunePanelMeta = null;
  try {
    const ipr = await fetch(IMMUNE_URL);
    if (ipr.ok) {
      const ipd = await ipr.json();
      meta.immunePanelMeta = ipd;
      // Map by name (Dryad uses display names; we resolve to cell-line IDs
      // via normalized name match against meta.names).
      const wantNorm = new Map();
      for (const [name, v] of Object.entries(ipd.byCellLine || {})) wantNorm.set(norm(name), { tismoName: name, ...v });
      for (const cl of meta.cellLines) {
        const hit = wantNorm.get(norm(meta.names?.[cl] || cl));
        if (hit) {
          meta.immunePanel[cl] = hit;
          if (!meta.sources[cl]) meta.sources[cl] = [];
          // Don't duplicate if TISMO already a source — just enrich its description.
          const existing = meta.sources[cl].find(s => s.name === 'TISMO');
          if (existing) {
            existing.what = `${existing.what}; immune-gene panel (Dryad)`;
          } else {
            meta.sources[cl].push({
              name: 'TISMO / Dryad',
              url: 'https://datadryad.org/dataset/doi:10.5061/dryad.b8gtht7g1',
              what: 'immune-gene panel (mean expression by ICB-response group)'
            });
          }
        }
      }
    }
  } catch (e) {
    console.warn('Could not load TISMO immune panel:', e);
  }

  // Composite immune-signature scores per cell line. Computed on the fly
  // from the panel data: mean z-score across each signature's gene set,
  // measured at preICB baseline so the score reflects the line's intrinsic
  // immune phenotype (not its post-ICB response). Signatures:
  //   tCellInflamed — Ayers-like IFN-γ / CD8 cytotoxic signature
  //   mdsc          — myeloid-derived suppressor / immunosuppression
  //   mhcI          — MHC-I antigen-presentation machinery
  //   mhcII         — MHC-II machinery
  //   m1m2          — M1-vs-M2 macrophage polarisation
  meta.immuneScores = {};
  const SIG_PANELS = {
    tCellInflamed: ['Cd8a', 'Cd8b1', 'Ifng', 'Cxcl9', 'Cxcl10', 'Cxcl11', 'Stat1', 'Gzmb', 'Gzma', 'Prf1', 'Cd3d', 'Cd3e', 'Irf1', 'Tigit', 'Lag3', 'Pdcd1'],
    mdsc: ['Arg1', 'Nos2', 'S100a8', 'S100a9', 'Cebpb', 'Csf1r', 'Csf1', 'Ccl2', 'Itgam', 'Ly6g'],
    mhcI: ['B2m', 'H2-K1', 'H2-D1', 'H2-T22', 'Tap1', 'Tap2', 'Tapbp', 'Psmb8', 'Psmb9', 'Nlrc5', 'Erap1'],
    mhcII: ['Cd74', 'Ciita', 'H2-Ab1', 'H2-Aa', 'H2-Eb1', 'H2-DMa', 'H2-DMb1'],
    m1: ['Nos2', 'Tnf', 'Il6', 'Cd68', 'Il12a', 'Il12b'],
    m2: ['Mrc1', 'Cd163', 'Il10', 'Arg1']
  };
  function computeImmuneScores() {
    if (!meta.immunePanelMeta?.cohortStats || !meta.immunePanel) return;
    const cohort = meta.immunePanelMeta.cohortStats;
    function panelZ(baselineMeans, genes) {
      const zs = [];
      for (const g of genes) {
        const v = baselineMeans?.[g];
        const c = cohort[g];
        if (v == null || !c || c.sd <= 0) continue;
        zs.push((v - c.mean) / c.sd);
      }
      return zs.length >= 3 ? zs.reduce((a, b) => a + b, 0) / zs.length : null;
    }
    for (const cl of meta.cellLines) {
      const ip = meta.immunePanel[cl];
      if (!ip) continue;
      const baseline = ip.preICB_baseline?.mean;
      if (!baseline) continue;
      const m1 = panelZ(baseline, SIG_PANELS.m1);
      const m2 = panelZ(baseline, SIG_PANELS.m2);
      meta.immuneScores[cl] = {
        tCellInflamed: panelZ(baseline, SIG_PANELS.tCellInflamed),
        mdsc:          panelZ(baseline, SIG_PANELS.mdsc),
        mhcI:          panelZ(baseline, SIG_PANELS.mhcI),
        mhcII:         panelZ(baseline, SIG_PANELS.mhcII),
        m1m2:          (m1 != null && m2 != null) ? (m1 - m2) : null
      };
    }
  }
  computeImmuneScores();

  // Full TISMO expression matrix (Dryad / Zeng 2022). Eager-load the
  // small metadata for the gene autocomplete; lazy-load the 1.7 MB
  // binary blob on first gene query so detail-pane render isn't slowed
  // for users who never use the gene search.
  meta.fullExpr = { meta: null, data: null, loading: null, loaded: false };
  try {
    const fmr = await fetch(FULL_EXPR_META_URL);
    if (fmr.ok) meta.fullExpr.meta = await fmr.json();
  } catch (e) {
    console.warn('Could not load TISMO full-expression metadata:', e);
  }

  async function loadFullExprMatrix() {
    if (meta.fullExpr.loaded) return;
    if (meta.fullExpr.loading) return meta.fullExpr.loading;
    meta.fullExpr.loading = (async () => {
      const t0 = performance.now();
      const r = await fetch(FULL_EXPR_BIN_URL);
      // Browser-native gzip decode — no external lib needed.
      const stream = r.body.pipeThrough(new DecompressionStream('gzip'));
      const buf = await new Response(stream).arrayBuffer();
      const int16 = new Int16Array(buf);
      const m = meta.fullExpr.meta;
      const sf = m.scaleFactor;
      const na = m.naValue;
      const out = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        out[i] = (int16[i] === na) ? NaN : int16[i] / sf;
      }
      meta.fullExpr.data = out;
      meta.fullExpr.geneIndex = new Map();
      m.genes.forEach((g, i) => meta.fullExpr.geneIndex.set(g.toUpperCase(), i));
      meta.fullExpr.cellLineIndex = new Map();
      m.cellLines.forEach((cl, i) => meta.fullExpr.cellLineIndex.set(cl, i));
      meta.fullExpr.loaded = true;
      console.log(`TISMO full-expression loaded: ${m.nGenes} genes × ${m.nCellLines} lines × ${m.nConditions} conds in ${((performance.now() - t0)/1000).toFixed(1)}s`);
    })();
    return meta.fullExpr.loading;
  }
  meta.loadFullExprMatrix = loadFullExprMatrix;

  try {
    const lr = await fetch(LIT_URL);
    if (lr.ok) {
      const lit = await lr.json();
      const flat = (k, v, id) => { if (v != null && v !== '') meta[k][id] = v; };
      // String/scalar fields we know about on each line.
      const fields = [
        'names:name', 'pmid', 'tumorLocation', 'modelType', 'mouseModel',
        'mouseModelDetailed', 'tissue', 'lineage', 'site', 'cancerType',
        'cancerTypeDetailed', 'media', 'cultureSystem', 'morphology',
        'morphologyDetailed', 'survivalDays', 'metastasis',
        'complexRearrangement', 'chromothripsis', 'strain', 'strainPct',
        'mhcA', 'mhcB', 'gender', 'immunocompetent', 'source', 'distributor',
        'curated', 'curatedTier', 'dataSource', 'litCitation',
        'cellosaurusRrid', 'ncitDisease', 'synonyms', 'immuneProfile',
        'cautions', 'drivers', 'providers'
      ];
      for (const entry of (lit.lines || [])) {
        const id = entry.id;
        if (!id || meta.sources[id]) continue; // skip dupes
        meta.cellLines.push(id);
        for (const f of fields) {
          const [dest, src] = f.includes(':') ? f.split(':') : [f, f];
          if (!meta[dest]) meta[dest] = {};
          if (entry[src] != null) meta[dest][id] = entry[src];
        }
        // Initialise sources list — primary literature is the base.
        const srcs = [];
        if (entry.litCitation) {
          srcs.push({ name: 'Primary literature', url: null, what: entry.litCitation });
        }
        meta.sources[id] = srcs;
      }
    }
  } catch (e) {
    // Literature file is optional — log and continue.
    console.warn('Could not load literature lines:', e);
  }

  const nTot = meta.cellLines.length;
  document.getElementById('count-tag').textContent = `${nTot} cell lines`;

  // ---------- UI state ----------
  const state = {
    activeId: null,
    sortDir: 1,                 // 1 asc, -1 desc
    filters: { q: '', lineage: '', cancer: '', model: '', sex: '', tier: '' },
    sortBy: 'name',
    // Side-by-side comparison: array of up to 2 pinned cell-line IDs.
    // When length === 2 and compareActive is true, the detail pane
    // renders the comparison view instead of the single-line view.
    compareIds: [],
    compareActive: false
  };

  // ---------- populate the lineage / cancer-type dropdowns from data ----------
  const uniqSorted = (obj) =>
    Array.from(new Set(Object.values(obj || {}).filter(Boolean))).sort();

  const lineages = uniqSorted(meta.lineage);
  const cancers  = uniqSorted(meta.cancerType);
  const lineageSel = document.getElementById('filterLineage');
  const cancerSel  = document.getElementById('filterCancer');
  for (const l of lineages) lineageSel.innerHTML += `<option value="${l}">${prettyLineage(l)}</option>`;
  for (const c of cancers)  cancerSel.innerHTML  += `<option value="${c}">${prettyCancer(c)}</option>`;

  // Camel-case lineage labels → human-readable.
  function prettyLineage(s) {
    if (!s) return '';
    // 'IntestineLarge' → 'Intestine, large'; 'MammaryGland' → 'Mammary gland';
    // 'Lymphoid-B' kept as-is.
    return s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/-/g, ' / ');
  }
  function prettyCancer(s) {
    if (!s) return '';
    return s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\//g, ' / ');
  }
  function prettyValue(s) {
    if (s == null || s === '') return '';
    if (typeof s !== 'string') return s;
    return s.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  // Immune-profile pill (colour-coded by category) — used inside the
  // "Immune profile" detail section so the user can scan TMB / MSI /
  // phenotype / ICB-response at a glance.
  function pill(category, label, detail) {
    const palette = {
      high:        { bg: '#fef3c7', fg: '#92400e', border: '#fde68a' },
      medium:      { bg: '#fef9c3', fg: '#854d0e', border: '#fde047' },
      low:         { bg: '#f3f4f6', fg: '#6b7280', border: '#e5e7eb' },
      stable:      { bg: '#f3f4f6', fg: '#6b7280', border: '#e5e7eb' },
      hot:         { bg: '#fee2e2', fg: '#991b1b', border: '#fecaca' },
      inflamed:    { bg: '#ffedd5', fg: '#9a3412', border: '#fed7aa' },
      variable:    { bg: '#fef3c7', fg: '#92400e', border: '#fde68a' },
      cold:        { bg: '#dbeafe', fg: '#1e40af', border: '#bfdbfe' },
      responsive:  { bg: '#dcfce7', fg: '#15803d', border: '#bbf7d0' },
      partial:     { bg: '#fef3c7', fg: '#92400e', border: '#fde68a' },
      resistant:   { bg: '#fee2e2', fg: '#991b1b', border: '#fecaca' },
      untested:    { bg: '#f3f4f6', fg: '#6b7280', border: '#e5e7eb' },
      unknown:     { bg: '#f3f4f6', fg: '#9ca3af', border: '#e5e7eb' }
    };
    const p = palette[category] || palette.unknown;
    return `<span class="badge" style="background:${p.bg}; color:${p.fg}; border-color:${p.border};" title="${(detail || '').replace(/"/g, '&quot;')}">${label}</span>`;
  }

  // Driver-mutation alteration → palette mapping. Mirrors the V2 oncoprint
  // colour cues: red = LoF / loss, blue = WT (when explicitly notable),
  // amber = mutated, purple = transgene, orange = amplified / gain.
  function alterationPill(alt) {
    const palettes = {
      'mutated':    { bg: '#fee2e2', fg: '#991b1b', border: '#fecaca' },
      'deleted':    { bg: '#fee2e2', fg: '#991b1b', border: '#fecaca' },
      'lost':       { bg: '#fee2e2', fg: '#991b1b', border: '#fecaca' },
      'low':        { bg: '#dbeafe', fg: '#1e40af', border: '#bfdbfe' },
      'wild-type':  { bg: '#dcfce7', fg: '#15803d', border: '#bbf7d0' },
      'WT':         { bg: '#dcfce7', fg: '#15803d', border: '#bbf7d0' },
      'transgene':  { bg: '#f3e8ff', fg: '#6b21a8', border: '#e9d5ff' },
      'amplified':  { bg: '#ffedd5', fg: '#9a3412', border: '#fed7aa' },
      'overexpressed': { bg: '#ffedd5', fg: '#9a3412', border: '#fed7aa' },
      'deficient':  { bg: '#fee2e2', fg: '#991b1b', border: '#fecaca' }
    };
    const p = palettes[alt] || { bg: '#f3f4f6', fg: '#6b7280', border: '#e5e7eb' };
    return `<span class="badge" style="background:${p.bg}; color:${p.fg}; border-color:${p.border}; font-family:ui-monospace, monospace; font-size:10px;">${alt}</span>`;
  }

  // Render the MCCA-derived mutation block (raw WES calls). Separate
  // from the literature-curated `drivers` array because the data shape
  // and provenance are different: this is per-variant SnpEff output
  // with HGVS_p, not a hand-curated alteration tag.
  function renderMccaMutations(m) {
    if (!m) return '';
    const drivers = m.driverMuts || [];
    const tmbBlock = `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
      <span class="badge" style="background:#fee2e2; color:#991b1b; border-color:#fecaca;"><b>${m.totalHigh}</b> HIGH-impact</span>
      <span class="badge" style="background:#fef3c7; color:#92400e; border-color:#fde68a;"><b>${m.totalModerate}</b> MODERATE-impact</span>
    </div>`;
    let drvBlock = '';
    if (drivers.length) {
      const rows = drivers.slice(0, 30).map(d => {
        const palette = d.impact === 'HIGH'
          ? { bg:'#fee2e2', fg:'#991b1b', border:'#fecaca' }
          : { bg:'#fef3c7', fg:'#92400e', border:'#fde68a' };
        const pill = `<span class="badge" style="background:${palette.bg}; color:${palette.fg}; border-color:${palette.border}; font-family:ui-monospace, monospace; font-size:10px;">${d.impact}</span>`;
        const effect = (d.effect || '').replace(/_/g, ' ').replace(/&/g, ' + ');
        return `<div style="display:grid; grid-template-columns: 110px 70px 1fr 90px; gap:8px; align-items:baseline; padding:3px 0; border-bottom:1px solid #f3f4f6; font-size:11px;">
          <div><code style="font-weight:600; color:#374151;">${d.gene}</code></div>
          <div>${pill}</div>
          <div style="color:var(--gray-700);">${effect} ${d.hgvsP ? `<code style="color:#374151;">${d.hgvsP}</code>` : ''}</div>
          <div style="color:var(--gray-500); font-size:10px; text-align:right; font-variant-numeric:tabular-nums;">${d.chrom ? `chr${d.chrom}:${d.pos}` : ''}</div>
        </div>`;
      }).join('');
      drvBlock = `<div style="font-size:11px; color:var(--gray-500); margin: 8px 0 4px;">Driver-panel hits (${drivers.length}${drivers.length > 30 ? ', showing top 30' : ''}):</div>${rows}`;
    }
    let topGenesBlock = '';
    if (m.topHighImpactGenes && m.topHighImpactGenes.length) {
      const chips = m.topHighImpactGenes.map(g => `<span style="background:#f3f4f6; padding:1px 6px; border-radius:10px; font-size:10px; border:1px solid #e5e7eb; margin-right:3px;"><code>${g.gene}</code> × ${g.n}</span>`).join('');
      topGenesBlock = `<div style="margin-top:8px; font-size:11px;"><span style="color:var(--gray-500);">Top HIGH-impact non-panel genes:</span> ${chips}</div>`;
    }
    return `
      <div class="section-title">Mutations &mdash; MCCA WES calls</div>
      <div style="font-size:11px; color:var(--gray-500); margin-bottom:6px;">SnpEff-annotated variants from MCCA's <a href="https://www.mcca.tum.de" target="_blank" rel="noopener" style="color:var(--green-700);">2025Q3 mutation release ↗</a>. Filtered to HIGH and MODERATE impact; pseudogenes (Gm*, *Rik) dropped. Counts are a rough TMB proxy.</div>
      ${tmbBlock}
      ${drvBlock}
      ${topGenesBlock}
    `;
  }

  function renderDrivers(drivers) {
    if (!Array.isArray(drivers) || drivers.length === 0) return '';
    const rows = drivers.map(d => {
      const gene = `<code style="font-weight:600; color:#374151;">${d.gene || ''}</code>`;
      const pill = alterationPill(d.alteration || 'unknown');
      const pathway = d.pathway ? `<span style="color:var(--gray-500); font-size:11px;">[${d.pathway}]</span>` : '';
      const note = d.note ? `<span style="color:var(--gray-700); font-size:11px;">${d.note}</span>` : '';
      return `<div style="display:grid; grid-template-columns: 110px 90px 1fr; gap:8px; align-items:baseline; padding:3px 0; border-bottom:1px solid #f3f4f6;">
        <div>${gene} ${pathway}</div>
        <div>${pill}</div>
        <div>${note}</div>
      </div>`;
    }).join('');
    return `
      <div class="section-title">Driver mutations &amp; genome</div>
      <div style="font-size:11px; color:var(--gray-500); margin-bottom:6px;">Literature-curated driver alterations. Pill colour: red = loss / mutated / deleted; green = notable WT; purple = engineered transgene; blue = low expression.</div>
      ${rows}
    `;
  }

  function renderImmuneProfile(prof) {
    if (!prof || typeof prof !== 'object') return '';
    const tmbPill   = prof.tmbCategory       ? pill(prof.tmbCategory,       'TMB: ' + prof.tmbCategory,       prof.tmbDetail) : '';
    const msiPill   = prof.msiStatus         ? pill(prof.msiStatus,         'MSI: ' + prof.msiStatus,         prof.msiDetail) : '';
    const phenPill  = prof.immunePhenotype   ? pill(prof.immunePhenotype,   'Phenotype: ' + prof.immunePhenotype, prof.immunePhenotypeDetail) : '';
    const icbPill   = prof.icbResponse       ? pill(prof.icbResponse,       'ICB: ' + prof.icbResponse,       prof.icbResponseDetail) : '';
    const pills = [tmbPill, msiPill, phenPill, icbPill].filter(Boolean).join(' ');
    const detailRow = (k, v) => v ? `<div class="field"><div class="k">${k}</div><div class="v">${v}</div></div>` : '';
    return `
      <div class="section-title">Immune profile</div>
      ${pills ? `<div style="margin: 0 0 10px; display:flex; gap:6px; flex-wrap:wrap;">${pills}</div>` : ''}
      ${detailRow('TMB',           prof.tmbDetail)}
      ${detailRow('MSI status',    prof.msiDetail)}
      ${detailRow('Phenotype',     prof.immunePhenotypeDetail)}
      ${detailRow('ICB response',  prof.icbResponseDetail)}
      ${prof.source ? `<div style="font-size:10px; color:var(--gray-500); margin-top:6px;">Source: ${prof.source}</div>` : ''}
    `;
  }

  // Distributor cross-refs from Cellosaurus xref-list. Each provider
  // chip is a clickable link to that catalog's product page for the
  // line (ATCC, Kerafast, Sigma, ABM, ECACC, etc.).
  function renderProviders(providers) {
    if (!Array.isArray(providers) || providers.length === 0) return '';
    const chips = providers.map(p => {
      const label = `${p.db || '?'}: ${p.accession || '?'}`;
      const inner = p.url
        ? `<a href="${p.url}" target="_blank" rel="noopener" style="color:#15803d; text-decoration:none;">${label} ↗</a>`
        : label;
      return `<span style="background:var(--green-50); padding:1px 6px; border-radius:10px; font-size:10px; border:1px solid var(--green-200); margin-right:3px;">${inner}</span>`;
    }).join('');
    return `<div class="field"><div class="k">Available from</div><div class="v" style="display:flex; flex-wrap:wrap; gap:3px;">${chips}</div></div>`;
  }

  // TISMO immune-gene panel renderer. For each panel group, a small
  // 5-col table: gene · baseline · R · NR · cohort-mean. Cells are
  // colour-coded by z-score against the cohort, and R-vs-NR differences
  // are highlighted (responder-enriched in green, NR-enriched in red).
  function renderImmunePanel(cl) {
    const ip = (typeof meta !== 'undefined' && meta.immunePanel) ? meta.immunePanel[cl] : null;
    const ipMeta = (typeof meta !== 'undefined') ? meta.immunePanelMeta : null;
    if (!ip || !ipMeta) return '';

    const base = ip.preICB_baseline || {};
    const rcond = ip.postICB_R || {};
    const nrcond = ip.postICB_NR || {};
    const cohort = ipMeta.cohortStats || {};

    // Cell shading by z-score against cohort.
    function zCell(value, gene) {
      if (value == null) return '<td style="color:#9ca3af; text-align:right;">—</td>';
      const c = cohort[gene];
      let bg = '#f9fafb';
      if (c && c.sd > 0) {
        const z = (value - c.mean) / c.sd;
        if (z >= 1.5)      bg = '#fecaca';     // red — very high
        else if (z >= 0.5) bg = '#fed7aa';     // amber — moderately high
        else if (z <= -1.5) bg = '#bfdbfe';    // blue — very low
        else if (z <= -0.5) bg = '#dbeafe';    // pale blue — moderately low
      }
      return `<td style="background:${bg}; text-align:right; font-variant-numeric:tabular-nums; padding:1px 6px;">${value.toFixed(2)}</td>`;
    }

    function rvnrDelta(r, nr) {
      if (r == null || nr == null) return '';
      const d = r - nr;
      const color = Math.abs(d) >= 0.3 ? (d > 0 ? '#15803d' : '#991b1b') : '#9ca3af';
      const sym = d > 0 ? '↑' : (d < 0 ? '↓' : '');
      return `<td style="color:${color}; text-align:right; padding:1px 6px; font-size:10px; font-variant-numeric:tabular-nums;">${sym}${Math.abs(d).toFixed(2)}</td>`;
    }

    let html = '';
    for (const [groupName, genes] of Object.entries(ipMeta.panel || {})) {
      const rows = [];
      for (const g of genes) {
        const b  = base.mean?.[g];
        const r  = rcond.mean?.[g];
        const nr = nrcond.mean?.[g];
        const c  = cohort[g];
        if (b == null && r == null && nr == null) continue;
        rows.push(`<tr>
          <td style="padding:1px 6px; font-family:ui-monospace, monospace; font-size:10px; color:#374151;">${g}</td>
          ${zCell(b, g)}
          ${zCell(r, g)}
          ${zCell(nr, g)}
          ${rvnrDelta(r, nr)}
          <td style="color:#9ca3af; text-align:right; padding:1px 6px; font-size:10px; font-variant-numeric:tabular-nums;">${c ? c.mean.toFixed(2) : '—'}</td>
        </tr>`);
      }
      if (!rows.length) continue;
      html += `<details style="margin-bottom:6px;">
        <summary style="cursor:pointer; font-size:12px; color:var(--gray-700); padding:4px 0; border-bottom:1px solid var(--gray-200); font-weight:600;">${groupName} <span style="color:#9ca3af; font-weight:400; font-size:11px;">(${rows.length} genes)</span></summary>
        <table style="border-collapse:collapse; font-size:11px; width:100%; margin-top:4px;">
          <thead><tr style="color:#6b7280; font-size:10px;">
            <th style="text-align:left; padding:2px 6px;">gene</th>
            <th style="text-align:right; padding:2px 6px;">baseline<br><span style="font-weight:400;">n=${base.n || 0}</span></th>
            <th style="text-align:right; padding:2px 6px;">R<br><span style="font-weight:400;">n=${rcond.n || 0}</span></th>
            <th style="text-align:right; padding:2px 6px;">NR<br><span style="font-weight:400;">n=${nrcond.n || 0}</span></th>
            <th style="text-align:right; padding:2px 6px;">R−NR</th>
            <th style="text-align:right; padding:2px 6px;">cohort μ</th>
          </tr></thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </details>`;
    }

    const totalBase  = base.n  || 0;
    const totalR     = rcond.n || 0;
    const totalNR    = nrcond.n || 0;

    // Composite signature scores for this line — mean z-score across
    // each curated gene panel, computed at preICB baseline.
    const scores = meta.immuneScores?.[cl];
    let scoreBar = '';
    if (scores) {
      const SCORE_DEFS = [
        { key: 'tCellInflamed', label: 'T-cell inflamed',  hi: '#15803d', lo: '#3730a3' },
        { key: 'mhcI',          label: 'MHC-I',             hi: '#15803d', lo: '#991b1b' },
        { key: 'mhcII',         label: 'MHC-II',            hi: '#15803d', lo: '#991b1b' },
        { key: 'mdsc',          label: 'MDSC / suppression',hi: '#991b1b', lo: '#15803d' },
        { key: 'm1m2',          label: 'M1 − M2',           hi: '#15803d', lo: '#991b1b' }
      ];
      const cellWidthPct = 100 / SCORE_DEFS.length;
      const scoreCells = SCORE_DEFS.map(d => {
        const z = scores[d.key];
        if (z == null) return `<td style="text-align:center; color:var(--gray-400); padding:4px;">—</td>`;
        // Map z ∈ [-2, +2] → 0..100 % of cell width as a horizontal bar.
        const clamped = Math.max(-2, Math.min(2, z));
        const pct = (Math.abs(clamped) / 2) * 50;
        const side = clamped >= 0 ? 'right' : 'left';
        const colour = clamped >= 0 ? d.hi : d.lo;
        const tone = clamped >= 0 ? '#dcfce7' : '#fee2e2';
        // The cell is split at 50% with bars growing outward from centre.
        return `<td style="padding:4px; vertical-align:middle;">
          <div style="position:relative; height:14px; background:#f9fafb; border-radius:4px; overflow:hidden;">
            <div style="position:absolute; top:0; bottom:0; left:50%; width:1px; background:#d1d5db;"></div>
            <div style="position:absolute; top:0; bottom:0; ${side}:50%; width:${pct}%; background:${tone};"></div>
          </div>
          <div style="text-align:center; font-size:10px; color:${colour}; font-variant-numeric:tabular-nums; margin-top:2px;">${z >= 0 ? '+' : ''}${z.toFixed(2)}σ</div>
        </td>`;
      }).join('');
      const headerCells = SCORE_DEFS.map(d => `<th style="text-align:center; font-size:9px; color:var(--gray-500); padding:2px 4px; font-weight:600; width:${cellWidthPct}%;">${d.label}</th>`).join('');
      scoreBar = `
        <div style="margin-bottom:10px;">
          <div style="font-size:11px; color:var(--gray-500); margin-bottom:4px;">Composite signature z-scores (vs 22-line TISMO cohort, at baseline). Bars grow from centre — right = above cohort, left = below; saturation at ±2σ.</div>
          <table style="width:100%; border-collapse:collapse;">
            <thead><tr>${headerCells}</tr></thead>
            <tbody><tr>${scoreCells}</tr></tbody>
          </table>
        </div>`;
    }

    return `
      <div class="section-title">Immune gene panel (TISMO)</div>
      <div style="font-size:11px; color:var(--gray-500); margin-bottom:8px;">
        Mean expression of a ${Object.values(ipMeta.panel).reduce((a,gs)=>a+gs.length,0)}-gene immune panel, per ICB-response group. Source: <a href="${ipMeta.source.url}" target="_blank" rel="noopener" style="color:var(--green-700);">${ipMeta.source.name} ↗</a> (${ipMeta.source.paper.split(',')[0]}). Values are log-normalised TPM (quantile + ComBat). Cell shading: red = high vs cohort, blue = low.
        ${totalBase + totalR + totalNR === 0 ? '<br><b>No samples</b> for this line in this cohort.' : ''}
      </div>
      ${scoreBar}
      ${html}
    `;
  }

  // Per-gene expression search — type any gene, see this line's value
  // for each condition (baseline / R / NR) alongside the cohort
  // distribution. Lazy-loads the full Dryad expression matrix (1.7 MB
  // gzipped) on first query.
  function renderFullExprSearch(cl) {
    const fe = meta.fullExpr;
    if (!fe || !fe.meta) return '';
    // Only show for lines that have TISMO coverage — otherwise there's
    // no value here, the line simply isn't in the matrix.
    if (!meta.tismo?.[cl]) return '';
    return `
      <div class="section-title">Expression search (TISMO)</div>
      <div style="font-size:11px; color:var(--gray-500); margin-bottom:6px;">
        Type any of the ${fe.meta.nGenes.toLocaleString()} genes profiled in the Dryad TISMO companion data &mdash; this line's baseline / R / NR expression appears alongside the cohort distribution (22 lines × 3 conditions). Useful for genes not in the curated immune panel above. <span id="fullExprStatus_${cl}" style="color:var(--gray-500);">Matrix not loaded yet.</span>
      </div>
      <input type="text" id="fullExprInput_${cl}" placeholder="Cd274, Ifng, Foxp3, ..." autocomplete="off"
             style="width: 100%; padding: 5px 8px; font-size: 12px; border: 1px solid var(--gray-300); border-radius: 4px; margin-bottom: 6px;">
      <div id="fullExprSuggest_${cl}" style="font-size: 10px; color: var(--gray-500); margin-bottom: 6px; min-height: 14px;"></div>
      <div id="fullExprResult_${cl}"></div>
    `;
  }

  // Wire up the search input after each detail-pane render.
  function wireFullExprSearch(cl) {
    const input = document.getElementById(`fullExprInput_${cl}`);
    if (!input) return;
    const suggest = document.getElementById(`fullExprSuggest_${cl}`);
    const result = document.getElementById(`fullExprResult_${cl}`);
    const status = document.getElementById(`fullExprStatus_${cl}`);
    const fe = meta.fullExpr;

    function setStatus(s) { if (status) status.textContent = s; }

    async function query(rawText) {
      const text = (rawText || '').trim();
      result.innerHTML = '';
      suggest.textContent = '';
      if (!text) return;
      // Lazy-load matrix on first query.
      if (!fe.loaded) {
        setStatus('Loading matrix (1.7 MB)...');
        try { await meta.loadFullExprMatrix(); }
        catch (e) { setStatus('Failed to load matrix.'); return; }
        setStatus('Matrix loaded.');
      }
      const want = text.toUpperCase();
      const exactIdx = fe.geneIndex.get(want);
      if (exactIdx == null) {
        // Show top-5 substring matches.
        const partials = [];
        for (const [g, i] of fe.geneIndex) {
          if (g.includes(want)) { partials.push(fe.meta.genes[i]); if (partials.length >= 8) break; }
        }
        suggest.innerHTML = partials.length
          ? `No exact match. Try: ${partials.map(p => `<a href="#" data-pick="${p}" style="color:var(--green-700);">${p}</a>`).join(', ')}`
          : `No gene matches &ldquo;${text}&rdquo;.`;
        suggest.querySelectorAll('a[data-pick]').forEach(a => {
          a.addEventListener('click', (e) => { e.preventDefault(); input.value = a.dataset.pick; query(a.dataset.pick); });
        });
        return;
      }
      // Found exact match — render this line's values + cohort distribution.
      const gi = exactIdx;
      const nCL = fe.meta.nCellLines;
      const nC = fe.meta.nConditions;
      const off = gi * nCL * nC;
      const thisLineIdx = fe.cellLineIndex.get(meta.tismo?.[cl]?.tismoName) ?? fe.cellLineIndex.get(meta.names?.[cl]) ?? null;
      const labels = fe.meta.conditions;

      const cohort = labels.map(() => []);
      let thisLine = labels.map(() => null);
      for (let ci = 0; ci < nCL; ci++) {
        for (let cond = 0; cond < nC; cond++) {
          const v = fe.data[off + ci * nC + cond];
          if (!isNaN(v)) {
            cohort[cond].push({ cl: fe.meta.cellLines[ci], v });
            if (ci === thisLineIdx) thisLine[cond] = v;
          }
        }
      }
      // Render: a row per condition. Each row shows this line's value as
      // a labeled bullet, plus the rest of the cohort as little dots so
      // user can see where this line sits.
      const formatRow = (cond, condIdx) => {
        const vals = cohort[condIdx];
        if (!vals.length) return `<div style="margin:6px 0; font-size:11px; color:var(--gray-500);"><b>${cond}</b>: no samples in cohort.</div>`;
        const min = Math.min(...vals.map(v => v.v));
        const max = Math.max(...vals.map(v => v.v));
        const range = max - min || 1;
        const dots = vals.map(({cl: clName, v}) => {
            const x = (v - min) / range * 100;
            const isThis = (clName === fe.meta.cellLines[thisLineIdx]);
            return `<circle cx="${x}%" cy="50%" r="${isThis ? 5 : 3}" fill="${isThis ? '#dc2626' : '#9ca3af'}" stroke="${isThis ? '#7f1d1d' : 'none'}" stroke-width="${isThis ? 1 : 0}"><title>${clName}: ${v.toFixed(2)}</title></circle>`;
        }).join('');
        const thisVal = thisLine[condIdx];
        const valStr = thisVal != null ? `<b>${thisVal.toFixed(2)}</b>` : '<span style="color:var(--gray-400);">no data</span>';
        const condColour = cond === 'baseline' ? 'var(--gray-500)' : cond === 'R' ? '#15803d' : '#991b1b';
        return `<div style="display:grid; grid-template-columns: 80px 70px 1fr; gap:8px; align-items:center; padding:3px 0; font-size:11px;">
          <span style="color:${condColour}; font-weight:600;">${cond}</span>
          <span style="font-variant-numeric:tabular-nums;">${valStr}</span>
          <svg viewBox="0 0 100 10" preserveAspectRatio="none" style="width:100%; height:14px;">${dots}</svg>
        </div>`;
      };
      const html = `
        <div style="margin-top:4px; padding: 6px 8px; background: var(--gray-50); border-left: 3px solid var(--green-700); border-radius: 0 4px 4px 0;">
          <div style="font-family:ui-monospace, monospace; font-weight:600; color:var(--gray-700); margin-bottom:4px;">${fe.meta.genes[gi]}</div>
          ${labels.map((c, i) => formatRow(c, i)).join('')}
          <div style="font-size:10px; color:var(--gray-500); margin-top:4px;">Each row: this line in red, other TISMO lines in gray. x-axis = expression range across cohort for this condition. Hover dots for cell-line names.</div>
        </div>`;
      result.innerHTML = html;
      setStatus(`Matrix loaded — ${fe.meta.nGenes.toLocaleString()} genes available.`);
    }

    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => query(input.value), 200);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { clearTimeout(timer); query(input.value); }
    });
  }

  // TISMO record section — surfaces the per-sample richness in TISMO:
  // ICB-response label distribution (R/NR/Baseline), cell-line genotype
  // variants studied (engineered KO/OE), mouse host strain variety,
  // ICB / drug treatment arms, implantation sites, GEO study links.
  // Linked out to the TISMO portal for the raw data.
  function renderTismo(t) {
    if (!t) return '';

    // Helper: render a top-k distribution as count pills.
    const distroChips = (distro, palette) => {
      if (!distro) return '';
      return Object.entries(distro).map(([k, n]) =>
        `<span style="background:${palette.bg}; color:${palette.fg}; padding:1px 6px; border-radius:10px; font-size:10px; border:1px solid ${palette.border}; margin-right:3px; font-variant-numeric:tabular-nums;"><b>${n}</b> ${k}</span>`
      ).join('');
    };

    // GEO accessions get clickable links; internal study IDs are plain pills.
    const studyChips = (t.studies || []).map(s => {
      if (/^GSE\d+$/.test(s)) {
        return `<a href="https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${s}" target="_blank" rel="noopener" style="background:#dcfce7; color:#15803d; padding:1px 6px; border-radius:10px; font-size:10px; text-decoration:none; border:1px solid #bbf7d0; margin-right:3px;">${s} ↗</a>`;
      }
      return `<span style="background:#f3f4f6; color:#6b7280; padding:1px 6px; border-radius:10px; font-size:10px; border:1px solid #e5e7eb; margin-right:3px;">${s}</span>`;
    }).join('');

    const portalLink = 'https://tismo.pku-genomics.org/#/databrowser';
    const rawLink    = 'https://datadryad.org/dataset/doi:10.5061/dryad.b8gtht7g1';

    // ICB-response summary — the headline number.
    const r = t.icbResponders || 0, nr = t.icbNonResponders || 0;
    const baseline = t.icbBaselineSamples || 0;
    const icbHeader = (r + nr + baseline) > 0
      ? `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
           <span class="badge" style="background:#dcfce7; color:#15803d; border-color:#bbf7d0;"><b>${r}</b> responder samples</span>
           <span class="badge" style="background:#fee2e2; color:#991b1b; border-color:#fecaca;"><b>${nr}</b> non-responder samples</span>
           <span class="badge" style="background:#f3f4f6; color:#6b7280;"><b>${baseline}</b> Baseline (untreated)</span>
         </div>`
      : `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
           <span class="badge" style="background:#f3f4f6; color:#6b7280; border-color:#e5e7eb;">no per-sample ICB-response labels</span>
         </div>`;

    const fields = [];
    if (t.vitroSamples) fields.push(`<b>${t.vitroSamples}</b> in-vitro`);
    if (t.vivoSamples)  fields.push(`<b>${t.vivoSamples}</b> in-vivo`);
    const sampleLine = fields.join(' · ');

    // The per-variable distributions. Each one is "Top 8 by sample count".
    const distroRow = (label, distro, palette) => {
      if (!distro || Object.keys(distro).length === 0) return '';
      return `<div class="field"><div class="k">${label}</div><div class="v" style="display:flex; flex-wrap:wrap; gap:3px;">${distroChips(distro, palette)}</div></div>`;
    };
    const pGenotype = { bg: '#eef2ff', fg: '#3730a3', border: '#c7d2fe' };
    const pStrain   = { bg: '#fef3c7', fg: '#92400e', border: '#fde68a' };
    const pTrt      = { bg: '#dcfce7', fg: '#15803d', border: '#bbf7d0' };
    const pSite     = { bg: '#f3f4f6', fg: '#374151', border: '#e5e7eb' };
    const pSub      = { bg: '#ffedd5', fg: '#9a3412', border: '#fed7aa' };

    return `
      <div class="section-title">TISMO record</div>
      <div style="font-size:11px; color:var(--gray-500); margin-bottom:6px;">
        Per-sample RNA-seq + ICB-treatment context aggregated from <a href="${portalLink}" target="_blank" rel="noopener" style="color:var(--green-700);">TISMO ↗</a>.
        Raw expression matrices are on <a href="${rawLink}" target="_blank" rel="noopener" style="color:var(--green-700);">Dryad ↗</a> (Zeng 2022).
        Counts below are samples (n × replicates), top-8 shown per axis.
      </div>
      ${icbHeader}
      ${sampleLine ? `<div class="field"><div class="k">Samples</div><div class="v">${sampleLine}${t.parent ? ` · child of <b>${t.parent}</b>` : ''}${t.originYear ? ` · est. ${t.originYear}` : ''}</div></div>` : ''}
      ${distroRow('Cell-line variants (in vivo)', t.vivoCellGenotype, pGenotype)}
      ${distroRow('Sub-clones (in vivo)',         t.vivoSubClone,     pSub)}
      ${distroRow('ICB / drug arms tested',       t.vivoMouseTreatment, pTrt)}
      ${distroRow('Host mouse strains',           t.vivoMouseStrain,   pStrain)}
      ${distroRow('Host mouse genotypes',         t.vivoMouseGenotype, pGenotype)}
      ${distroRow('Implantation sites',           t.vivoImplantationSite, pSite)}
      ${distroRow('In-vitro treatments',          t.vitroCellTreatment, pTrt)}
      ${t.origin ? `<div class="field"><div class="k">Origin (TISMO)</div><div class="v">${t.origin}</div></div>` : ''}
      ${studyChips ? `<div style="margin-top:8px;"><div style="font-size:11px; color:var(--gray-500); margin-bottom:4px;">GEO studies (${(t.studies||[]).length}):</div>${studyChips}</div>` : ''}
    `;
  }

  // Sex glyph (♀ / ♂ / ⚥) coloured to match Correlate V2.
  function sexGlyph(cl) {
    const g = (meta.gender?.[cl] || '').toLowerCase();
    if (g === 'female') return { sym: '♀', cls: 'f', title: 'Female' };
    if (g === 'male')   return { sym: '♂', cls: 'm', title: 'Male' };
    return { sym: '⚥', cls: 'u', title: 'Unknown / not reported' };
  }

  // ---------- list pane ----------
  const listEl = document.getElementById('cl-list');
  const searchEl = document.getElementById('search');
  const sortBySel = document.getElementById('sortBy');
  const sortDirBtn = document.getElementById('sortDir');
  const activeBar = document.getElementById('activeBar');

  function applyFilters() {
    const q = state.filters.q.trim().toLowerCase();
    return meta.cellLines.filter((cl) => {
      if (state.filters.lineage && (meta.lineage[cl] || '') !== state.filters.lineage) return false;
      if (state.filters.cancer  && (meta.cancerType[cl] || '') !== state.filters.cancer) return false;
      if (state.filters.model   && (meta.modelType[cl] || '') !== state.filters.model) return false;
      if (state.filters.sex     && (meta.gender[cl] || '').toLowerCase() !== state.filters.sex) return false;
      if (state.filters.tier === '1' && meta.curatedTier[cl] !== 1) return false;
      if (state.filters.tier === '1or2' && meta.curatedTier[cl] !== 1 && meta.curatedTier[cl] !== 2) return false;
      if (state.filters.tier === 'tismo' && !meta.immunePanel?.[cl]) return false;
      if (state.filters.tier === 'lit'   && !meta.litCitation?.[cl]) return false;
      if (q) {
        const hay = [
          meta.names[cl] || cl, meta.lineage[cl], meta.cancerType[cl],
          meta.modelType[cl], meta.curated[cl] || '', cl
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function sortFiltered(list) {
    const dir = state.sortDir;
    const keyOf = (cl) => {
      switch (state.sortBy) {
        case 'tier':    return meta.curatedTier[cl] || 99;
        case 'lineage': return (meta.lineage[cl] || '~').toLowerCase();
        case 'cancer':  return (meta.cancerType[cl] || meta.modelType[cl] || '~').toLowerCase();
        case 'tismo':   {
          const t = meta.tismo?.[cl];
          // TISMO-covered lines sort to the top in ascending order (lower
          // is "more interesting"). Within TISMO, prefer those with ICB
          // arms, then by total sample count.
          if (!t) return 99;
          const hasIcb = (t.icbTreatedSamples || 0) > 0;
          return hasIcb ? 0 : (10 - Math.min(9, t.vitroSamples + t.vivoSamples) / 10);
        }
        case 'pubmed':  {
          // Negative count for ascending = highest count first.
          const c = meta.pubmed?.[cl]?.count;
          return c == null ? 0 : -c;
        }
        case 'tmb':     {
          const m = meta.mutations?.[cl];
          // TMB-proxy: total HIGH + MODERATE-impact filtered variants.
          // Negative for ascending = highest TMB first.
          if (!m) return 0;
          return -(m.totalHigh + m.totalModerate / 10);
        }
        case 'icb':     {
          // Surface lines with the most actual ICB-arm labelled samples
          // (R + NR + Baseline) in TISMO.
          const t = meta.tismo?.[cl];
          if (!t) return 0;
          return -((t.icbResponders || 0) + (t.icbNonResponders || 0) + (t.icbBaselineSamples || 0));
        }
        case 'tCellInflamed':
        case 'mdsc':
        case 'mhcI':
        case 'mhcII':
        case 'm1m2': {
          // Negative z-score = pushed to top in ascending sort.
          const s = meta.immuneScores?.[cl]?.[state.sortBy];
          return s == null ? 99 : -s;
        }
        default:        return (meta.names[cl] || cl).toLowerCase();
      }
    };
    list.sort((a, b) => {
      const ka = keyOf(a), kb = keyOf(b);
      if (ka < kb) return -1 * dir;
      if (ka > kb) return  1 * dir;
      return (meta.names[a] || a).localeCompare(meta.names[b] || b);
    });
    return list;
  }

  function render() {
    const filtered = sortFiltered(applyFilters());
    const html = filtered.map((cl) => {
      const name = meta.names[cl] || cl;
      const sx = sexGlyph(cl);
      const lin = prettyLineage(meta.lineage[cl] || '');
      const tier = meta.curatedTier[cl];
      const tierTag = tier === 1 ? '<span class="tier-1">★ T1</span>'
                    : tier === 2 ? '<span class="tier-2">T2</span>' : '';
      const tismoTag = meta.tismo?.[cl] ? '<span class="tismo-tag" title="Has a TISMO RNA-seq / ICB-treatment record">tismo</span>' : '';
      const pinned = state.compareIds.includes(cl) ? '<span title="Pinned for comparison" style="margin-left:4px;">📌</span>' : '';
      return `<div class="cl-row${cl === state.activeId ? ' active' : ''}" data-cl="${cl}" title="${cl}">`
        + `<span class="sex ${sx.cls}" title="${sx.title}">${sx.sym}</span>`
        + `<span class="name">${name}${tierTag}${tismoTag}${pinned}</span>`
        + `<span class="tissue">${lin}</span>`
        + `</div>`;
    }).join('');
    listEl.innerHTML = html || '<div class="empty">No cell lines match your filters.</div>';
    renderActiveBar(filtered.length);
  }

  function renderActiveBar(visibleN) {
    const chips = [];
    const total = meta.cellLines.length;
    const f = state.filters;
    if (f.lineage) chips.push(chip('Lineage: ' + prettyLineage(f.lineage), () => { f.lineage = ''; lineageSel.value = ''; render(); }));
    if (f.cancer)  chips.push(chip('Cancer: ' + prettyCancer(f.cancer),    () => { f.cancer = '';  cancerSel.value  = ''; render(); }));
    if (f.model)   chips.push(chip('Model: '  + prettyValue(f.model),       () => { f.model = '';   document.getElementById('filterModel').value = ''; render(); }));
    if (f.sex)     chips.push(chip('Sex: '    + f.sex,                       () => { f.sex = '';     document.getElementById('filterSex').value = ''; render(); }));
    if (f.tier) {
      const tierLabel = f.tier === '1'     ? 'Tier 1 only'
                      : f.tier === '1or2'  ? 'Tier 1 + 2'
                      : f.tier === 'tismo' ? 'TISMO immune-panel'
                      : f.tier === 'lit'   ? 'Literature lines'
                      : f.tier;
      chips.push(chip(tierLabel, () => { f.tier = ''; document.getElementById('filterTier').value = ''; render(); }));
    }
    if (f.q)       chips.push(chip('Search: ' + f.q,                         () => { f.q = ''; searchEl.value = ''; render(); }));
    if (chips.length) {
      activeBar.classList.add('shown');
      activeBar.innerHTML = `<span style="color:var(--gray-500);">Showing ${visibleN} of ${total}:</span>`
        + chips.map(c => c.html).join('')
        + ` <button class="reset" id="resetBtn">reset</button>`;
      for (const c of chips) {
        activeBar.querySelector(`[data-chip="${c.id}"]`)?.addEventListener('click', (e) => {
          e.preventDefault(); c.onClear();
        });
      }
      document.getElementById('resetBtn').addEventListener('click', resetAll);
    } else {
      activeBar.classList.remove('shown');
      activeBar.innerHTML = '';
    }
  }

  let chipCounter = 0;
  function chip(label, onClear) {
    const id = 'c' + (chipCounter++);
    return {
      id, onClear,
      html: `<span class="chip">${label} <a href="#" data-chip="${id}">×</a></span>`
    };
  }

  function resetAll() {
    Object.assign(state.filters, { q: '', lineage: '', cancer: '', model: '', sex: '', tier: '' });
    searchEl.value = '';
    document.getElementById('filterLineage').value = '';
    document.getElementById('filterCancer').value  = '';
    document.getElementById('filterModel').value   = '';
    document.getElementById('filterSex').value     = '';
    document.getElementById('filterTier').value    = '';
    render();
  }

  // ---------- compare-view helpers ----------
  function pinForCompare(cl) {
    const i = state.compareIds.indexOf(cl);
    if (i >= 0) {
      state.compareIds.splice(i, 1);
    } else {
      if (state.compareIds.length >= 2) state.compareIds.shift(); // drop the oldest
      state.compareIds.push(cl);
    }
    // Re-render detail so the pin-button label updates and the banner
    // recomputes. Also re-render the list so "pinned" markers update.
    render();
    renderDetail(state.activeId);
  }

  function renderCompareBanner() {
    if (state.compareIds.length === 0) return '';
    const ids = state.compareIds;
    const pinned = ids.map(id =>
      `<code style="background:var(--green-50); color:var(--green-800); padding:1px 6px; border-radius:8px; border:1px solid var(--green-200);">${meta.names[id] || id}</code>`
    ).join(' + ');
    const showHide = ids.length === 2
      ? (state.compareActive
        ? `<button data-compare-action="back" style="background:#fff; border:1px solid var(--gray-300); padding:3px 8px; font-size:11px; cursor:pointer; border-radius:4px;">← Back to single line</button>`
        : `<button data-compare-action="show" style="background:var(--green-700); color:#fff; border:none; padding:3px 10px; font-size:11px; cursor:pointer; border-radius:4px;">Compare these two →</button>`)
      : `<span style="color:var(--gray-500); font-size:11px; font-style:italic;">Pin a second line to compare.</span>`;
    return `<div style="margin: 0 0 14px; padding: 8px 12px; background: var(--green-50); border-left: 3px solid var(--green-700); border-radius: 0 4px 4px 0; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
      <span style="font-size:11px; color:var(--green-800);"><b>Pinned</b>: ${pinned}</span>
      <span style="margin-left:auto;">${showHide}</span>
      <button data-compare-action="clear" title="Clear pins" style="background:none; border:none; color:var(--gray-500); cursor:pointer; font-size:11px; padding:0;">×</button>
    </div>`;
  }

  function wireCompareButtons() {
    document.querySelectorAll('[data-pin-cl]').forEach(b => {
      b.addEventListener('click', (e) => { e.stopPropagation(); pinForCompare(b.dataset.pinCl); });
    });
    document.querySelectorAll('[data-compare-action]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const a = b.dataset.compareAction;
        if (a === 'show') { state.compareActive = true; renderDetail(null); }
        else if (a === 'back') { state.compareActive = false; renderDetail(state.activeId); }
        else if (a === 'clear') { state.compareIds = []; state.compareActive = false; render(); renderDetail(state.activeId); }
      });
    });
  }

  // Side-by-side view of two cell lines. Picks a focused field set and
  // shows columns for A and B; rows where values differ get a faint
  // amber highlight. Immune scores render as their bar visualisation
  // doubled up so the user can eyeball the contrast.
  function renderCompareView(aId, bId) {
    const a = meta.names[aId] || aId, b = meta.names[bId] || bId;

    const get = (cl, k) => meta[k]?.[cl];
    const fmtPretty = (v) => v == null || v === '' ? '<span style="color:var(--gray-400);">—</span>' : prettyValue(typeof v === 'string' ? v : String(v));

    const rows = [];
    function addRow(label, va, vb, formatter) {
      const f = formatter || fmtPretty;
      const av = f(va), bv = f(vb);
      // Highlight if the displayed strings differ AND neither is the
      // empty/"—" placeholder.
      const aStripped = va == null || va === '';
      const bStripped = vb == null || vb === '';
      const differ = !aStripped && !bStripped && String(va) !== String(vb);
      const rowStyle = differ ? 'background:#fffbeb;' : '';
      rows.push(`<tr style="${rowStyle}"><td style="padding:4px 8px; color:var(--gray-500); font-size:11px; vertical-align:top; width:140px;">${label}</td><td style="padding:4px 8px; vertical-align:top;">${av}</td><td style="padding:4px 8px; vertical-align:top;">${bv}</td></tr>`);
    }

    addRow('Lineage',           prettyLineage(get(aId, 'lineage')), prettyLineage(get(bId, 'lineage')));
    addRow('Cancer type',       get(aId, 'cancerType'), get(bId, 'cancerType'), v => v == null ? '<span style="color:var(--gray-400);">—</span>' : prettyCancer(v));
    addRow('Cancer (detail)',   get(aId, 'cancerTypeDetailed'), get(bId, 'cancerTypeDetailed'), v => v == null ? '<span style="color:var(--gray-400);">—</span>' : prettyCancer(v));
    addRow('Tumour location',   get(aId, 'tumorLocation'), get(bId, 'tumorLocation'));
    addRow('Model type',        get(aId, 'modelType'), get(bId, 'modelType'));
    addRow('Mouse model',       get(aId, 'mouseModel'), get(bId, 'mouseModel'));
    addRow('Background strain', get(aId, 'strain'), get(bId, 'strain'));
    addRow('MHC haplotype',     get(aId, 'mhcA'), get(bId, 'mhcA'));
    addRow('Sex of host',       get(aId, 'gender'), get(bId, 'gender'));
    addRow('Tier',              get(aId, 'curatedTier'), get(bId, 'curatedTier'), v => v == null ? '<span style="color:var(--gray-400);">—</span>' : String(v));

    // Driver mutations — show union with marker for which line carries each.
    const drvA = (meta.drivers?.[aId] || []).map(d => d.gene + (d.alteration ? `:${d.alteration}` : ''));
    const drvB = (meta.drivers?.[bId] || []).map(d => d.gene + (d.alteration ? `:${d.alteration}` : ''));
    addRow('Drivers (literature)', drvA.length ? drvA.join(', ') : null, drvB.length ? drvB.join(', ') : null);

    const mutA = meta.mutations?.[aId], mutB = meta.mutations?.[bId];
    addRow('MCCA WES HIGH-impact', mutA?.totalHigh, mutB?.totalHigh, v => v == null ? '<span style="color:var(--gray-400);">—</span>' : String(v));
    addRow('MCCA WES MODERATE',    mutA?.totalModerate, mutB?.totalModerate, v => v == null ? '<span style="color:var(--gray-400);">—</span>' : String(v));

    // PubMed presence
    const pubA = meta.pubmed?.[aId]?.count, pubB = meta.pubmed?.[bId]?.count;
    addRow('PubMed papers',  pubA, pubB, v => v == null ? '<span style="color:var(--gray-400);">—</span>' : String(v));

    // TISMO summary
    const tA = meta.tismo?.[aId], tB = meta.tismo?.[bId];
    addRow('TISMO samples',
      tA ? `${tA.vivoSamples} in-vivo, ${tA.vitroSamples} in-vitro` : null,
      tB ? `${tB.vivoSamples} in-vivo, ${tB.vitroSamples} in-vitro` : null);
    addRow('ICB arms (R / NR)',
      tA ? `${tA.icbResponders} / ${tA.icbNonResponders}` : null,
      tB ? `${tB.icbResponders} / ${tB.icbNonResponders}` : null);

    // Immune signature scores — render as numeric z and a tiny inline bar.
    const renderScore = (z) => {
      if (z == null) return '<span style="color:var(--gray-400);">—</span>';
      const clamped = Math.max(-2, Math.min(2, z));
      const pct = (Math.abs(clamped) / 2) * 50;
      const side = clamped >= 0 ? 'right' : 'left';
      const colour = clamped >= 0 ? '#15803d' : '#991b1b';
      const tone = clamped >= 0 ? '#dcfce7' : '#fee2e2';
      return `<div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:11px; font-variant-numeric:tabular-nums; min-width:50px; color:${colour};">${z >= 0 ? '+' : ''}${z.toFixed(2)}σ</span>
        <div style="position:relative; flex:1; height:10px; background:#f9fafb; border-radius:3px; overflow:hidden;">
          <div style="position:absolute; top:0; bottom:0; left:50%; width:1px; background:#d1d5db;"></div>
          <div style="position:absolute; top:0; bottom:0; ${side}:50%; width:${pct}%; background:${tone};"></div>
        </div>
      </div>`;
    };
    const sA = meta.immuneScores?.[aId], sB = meta.immuneScores?.[bId];
    const SCORE_NAMES = [
      ['T-cell inflamed', 'tCellInflamed'],
      ['MHC-I',           'mhcI'],
      ['MHC-II',          'mhcII'],
      ['MDSC',            'mdsc'],
      ['M1 − M2',         'm1m2']
    ];
    for (const [label, key] of SCORE_NAMES) {
      const za = sA?.[key], zb = sB?.[key];
      const va = renderScore(za), vb = renderScore(zb);
      const differ = za != null && zb != null && Math.abs(za - zb) >= 0.5;
      const rowStyle = differ ? 'background:#fffbeb;' : '';
      rows.push(`<tr style="${rowStyle}"><td style="padding:4px 8px; color:var(--gray-500); font-size:11px; vertical-align:middle;">${label}</td><td style="padding:4px 8px;">${va}</td><td style="padding:4px 8px;">${vb}</td></tr>`);
    }

    return `
      <h2>Side-by-side comparison</h2>
      <div style="font-size:11px; color:var(--gray-500); margin-bottom:12px;">Rows that differ are highlighted in amber. Driver-mutation lists are the literature-curated set (8 workhorses) where available; MCCA WES counts are TMB proxy. Immune signature deltas of |Δz| ≥ 0.5σ get the highlight.</div>
      <table style="border-collapse:collapse; width:100%; font-size:12px;">
        <thead>
          <tr style="border-bottom:2px solid var(--green-700); background:var(--green-50);">
            <th style="padding:6px 8px; text-align:left; color:var(--green-800);">Field</th>
            <th style="padding:6px 8px; text-align:left; color:var(--green-800);">${a}</th>
            <th style="padding:6px 8px; text-align:left; color:var(--green-800);">${b}</th>
          </tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    `;
  }

  // ---------- detail pane ----------
  function renderDetail(cl) {
    const pane = document.getElementById('detail-pane');
    // Compare-view takeover: when two lines are pinned and compareActive
    // is true, render the side-by-side view instead of the single-line
    // detail. The "show comparison" / "back to single line" buttons in
    // the banner toggle compareActive.
    if (state.compareActive && state.compareIds.length === 2) {
      pane.innerHTML = renderCompareBanner() + renderCompareView(state.compareIds[0], state.compareIds[1]);
      wireCompareButtons();
      return;
    }
    if (!cl) {
      pane.innerHTML = renderCompareBanner() + '<div class="placeholder">Pick a cell line from the list to see its details.</div>';
      wireCompareButtons();
      return;
    }
    const name = meta.names[cl] || cl;
    const tier = meta.curatedTier[cl];
    const tierBadge = tier === 1 ? '<span class="badge t1">Tier 1 — workhorse</span>'
                    : tier === 2 ? '<span class="badge t2">Tier 2</span>' : '';
    const modelType = meta.modelType[cl];
    const modelBadge = modelType
      ? `<span class="badge ${modelType === 'Wildtype' ? 'wt' : 'model'}">${prettyValue(modelType)}</span>`
      : '';

    const sx = sexGlyph(cl);
    const sexBadge = `<span class="badge" style="color:${sx.cls === 'f' ? 'var(--pink-600)' : sx.cls === 'm' ? 'var(--blue-700)' : 'var(--gray-500)'};">${sx.sym} ${sx.title}</span>`;

    const row = (k, v) => v == null || v === ''
      ? ''
      : `<div class="field"><div class="k">${k}</div><div class="v">${v}</div></div>`;

    const strain = meta.strain[cl];
    const strainPct = meta.strainPct[cl];
    const strainV = strain
      ? strain + (strainPct ? ' <span style="color:#9ca3af;">(' + (typeof strainPct === 'number' ? strainPct.toFixed(0) + '%' : strainPct) + ')</span>' : '')
      : '';

    const pmid = meta.pmid[cl];
    const pmidV = pmid
      ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${String(pmid).split(/[ ,;]/)[0]}/" target="_blank" rel="noopener">${pmid} ↗</a>`
      : '';

    // Sections — grouped to mirror Correlate V2's CLB detail pane.
    // "Data from" chip row — every source that contributed data for
    // this line, with a clickable link to the source page. Always
    // includes Cellosaurus link when we have an RRID, and the primary
    // literature citation when curated.
    const sources = meta.sources?.[cl] || [];
    const chipColours = {
      'MCCA':                { bg: '#dbeafe', fg: '#1e40af', border: '#bfdbfe' },
      'Cellosaurus':         { bg: '#dcfce7', fg: '#15803d', border: '#bbf7d0' },
      'TISMO':               { bg: '#ffedd5', fg: '#9a3412', border: '#fed7aa' },
      'Primary literature':  { bg: '#fef3c7', fg: '#92400e', border: '#fde68a' },
      'PubMed':              { bg: '#f3e8ff', fg: '#6b21a8', border: '#e9d5ff' }
    };
    const sourceChips = sources.map(s => {
      const p = chipColours[s.name] || { bg: '#f3f4f6', fg: '#6b7280', border: '#e5e7eb' };
      const label = `${s.name}${s.what ? ` <span style="opacity:0.7;">— ${s.what}</span>` : ''}`;
      const inner = s.url
        ? `<a href="${s.url}" target="_blank" rel="noopener" style="color:${p.fg}; text-decoration:none;">${label} ↗</a>`
        : label;
      return `<span style="background:${p.bg}; color:${p.fg}; padding:2px 8px; border-radius:10px; font-size:11px; border:1px solid ${p.border};">${inner}</span>`;
    }).join(' ');
    const provenance = sourceChips
      ? `<div style="margin: 0 0 14px; display:flex; flex-direction:column; gap:6px;">
           <div style="font-size:10px; color:var(--gray-500); text-transform:uppercase; letter-spacing:0.05em;">Data from</div>
           <div style="display:flex; gap:4px; flex-wrap:wrap;">${sourceChips}</div>
         </div>`
      : '';

    // Synonyms line (Cellosaurus name-list minus the canonical identifier).
    const syns = meta.synonyms?.[cl];
    const synonymsLine = Array.isArray(syns) && syns.length
      ? `<div style="font-size:11px; color:var(--gray-500); margin: -4px 0 14px;">also known as: ${syns.map(s => `<code style="background:#f3f4f6; padding:1px 4px; border-radius:3px; color:#374151;">${s}</code>`).join(' ')}</div>`
      : '';

    // Cautions block — variant heterogeneity, mis-identification, etc.
    const cautions = meta.cautions?.[cl];
    const cautionBlock = Array.isArray(cautions) && cautions.length
      ? `<div style="margin: 0 0 14px; padding: 8px 12px; background: #fef2f2; border-left: 3px solid #dc2626; font-size: 11px; color: #991b1b; border-radius: 0 4px 4px 0;">
           <b>⚠ Caution${cautions.length > 1 ? 's' : ''}:</b>
           <ul style="margin: 4px 0 0; padding-left: 18px;">
             ${cautions.map(c => `<li>${c}</li>`).join('')}
           </ul>
         </div>`
      : '';

    const html = `
      ${renderCompareBanner()}
      <h2>${name} ${tierBadge} ${modelBadge} ${sexBadge} <button data-pin-cl="${cl}" class="pin-btn" title="${state.compareIds.includes(cl) ? 'Unpin from comparison' : 'Pin this line for side-by-side comparison'}" style="margin-left:auto; font-size:11px; padding:2px 8px; cursor:pointer; background:${state.compareIds.includes(cl) ? 'var(--green-50)' : '#fff'}; border:1px solid ${state.compareIds.includes(cl) ? 'var(--green-700)' : 'var(--gray-300)'}; color:${state.compareIds.includes(cl) ? 'var(--green-700)' : 'var(--gray-500)'}; border-radius:4px;">${state.compareIds.includes(cl) ? '📌 pinned' : '📌 pin for compare'}</button></h2>
      <div class="id">${cl}${meta.ncitDisease?.[cl] ? ' · ' + meta.ncitDisease[cl] : ''}</div>
      ${synonymsLine}
      ${provenance}
      ${cautionBlock}

      <div class="section-title">Cancer classification</div>
      ${row('Cancer type',           prettyCancer(meta.cancerType[cl] || ''))}
      ${row('Cancer type (detail)',  prettyCancer(meta.cancerTypeDetailed[cl] || ''))}
      ${row('Tumour location',       prettyValue(meta.tumorLocation[cl] || ''))}
      ${row('Tissue / lineage',      prettyLineage(meta.lineage[cl] || ''))}
      ${row('Tissue category',       prettyValue(meta.tissue[cl] || ''))}
      ${row('Anatomic site',         prettyValue(meta.site[cl] || ''))}
      ${row('Morphology',            prettyValue(meta.morphology[cl] || ''))}
      ${row('Morphology (detail)',   meta.morphologyDetailed[cl])}

      <div class="section-title">Mouse model</div>
      ${row('Model type',            prettyValue(modelType || ''))}
      ${row('Driver / GEMM',         prettyValue(meta.mouseModel[cl] || ''))}
      ${row('GEMM (detail)',         meta.mouseModelDetailed[cl])}
      ${row('Background strain',     strainV)}
      ${row('Sex of host',           meta.gender[cl])}

      <div class="section-title">Clinical & genome</div>
      ${row('Survival (days)',       meta.survivalDays[cl])}
      ${row('Distant metastasis',    meta.metastasis[cl])}
      ${row('Complex rearrangement', meta.complexRearrangement[cl])}
      ${row('Chromothripsis',        meta.chromothripsis[cl])}

      ${renderDrivers(meta.drivers?.[cl])}

      ${renderMccaMutations(meta.mutations?.[cl])}

      <div class="section-title">Immune context</div>
      ${row('MHC haplotype A',         meta.mhcA[cl])}
      ${row('MHC haplotype B',         meta.mhcB[cl])}
      ${row('Immunocompetent transplant', meta.immunocompetent[cl])}

      ${renderImmuneProfile(meta.immuneProfile?.[cl])}

      ${renderTismo(meta.tismo?.[cl])}

      ${renderImmunePanel(cl)}

      ${renderFullExprSearch(cl)}

      ${meta.pubmed?.[cl]?.count != null ? `
      <div class="section-title">Literature presence</div>
      <div class="field">
        <div class="k">PubMed mentions</div>
        <div class="v"><b>${meta.pubmed[cl].count.toLocaleString()}</b> paper${meta.pubmed[cl].count === 1 ? '' : 's'} mentioning <code>${meta.pubmed[cl].name}</code> in a cancer/mouse context · <a href="${meta.pubmed[cl].pubmedUrl}" target="_blank" rel="noopener" style="color:var(--green-700);">open search ↗</a></div>
      </div>` : ''}

      <div class="section-title">Culture & source</div>
      ${row('Curated name',     meta.curated[cl] || '<em style="color:#9ca3af;">not on curated list</em>')}
      ${row('Media',            meta.media[cl])}
      ${row('Culture system',   prettyValue(meta.cultureSystem[cl] || ''))}
      ${row('Source',           prettyValue(meta.source[cl] || ''))}
      ${row('Distributor',      meta.distributor[cl])}
      ${renderProviders(meta.providers?.[cl])}
      ${row('PMID',             pmidV)}

      <div class="stub-note">
        <b>Coming next:</b> Driver mutations, copy number, expression profile (MCCA),
        FACS surface markers, immune-context overlay from TISMO, executive summary,
        deep-dive Wiki modal, curated collections panel with oncoprint-style
        include/exclude. v0.2 still shows only the identity layer.
      </div>
    `;
    pane.innerHTML = html;
    wireCompareButtons();
    wireFullExprSearch(cl);
  }

  // ---------- events ----------
  searchEl.addEventListener('input', () => { state.filters.q = searchEl.value; render(); });
  lineageSel.addEventListener('change', () => { state.filters.lineage = lineageSel.value; render(); });
  cancerSel.addEventListener('change',  () => { state.filters.cancer  = cancerSel.value;  render(); });
  document.getElementById('filterModel').addEventListener('change', (e) => { state.filters.model = e.target.value; render(); });
  document.getElementById('filterSex').addEventListener('change',   (e) => { state.filters.sex   = e.target.value; render(); });
  document.getElementById('filterTier').addEventListener('change',  (e) => { state.filters.tier  = e.target.value; render(); });
  sortBySel.addEventListener('change', () => { state.sortBy = sortBySel.value; render(); });
  sortDirBtn.addEventListener('click', () => {
    state.sortDir = -state.sortDir;
    sortDirBtn.textContent = state.sortDir === 1 ? '▲' : '▼';
    render();
  });
  listEl.addEventListener('click', (e) => {
    const row = e.target.closest('.cl-row');
    if (!row) return;
    state.activeId = row.dataset.cl;
    render();
    renderDetail(state.activeId);
  });

  // Default sort: tier (then name) — so the workhorses surface first.
  state.sortBy = 'tier';
  sortBySel.value = 'tier';
  render();
})();
