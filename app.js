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
          meta.sources[cl].push({
            name: 'TISMO',
            url: 'https://tismo.pku-genomics.org/#/databrowser',
            what: `RNA-seq sample index (${hit.vitroSamples || 0} in-vitro / ${hit.vivoSamples || 0} in-vivo, ${(hit.studies || []).length} studies)`
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
    sortBy: 'name'
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

  // TISMO record section — sample counts, GEO study links, ICB
  // arm counts. Linked out to the TISMO portal for the raw data.
  function renderTismo(t) {
    if (!t) return '';
    // GEO accessions are GSE-prefixed; the rest are internal study IDs
    // (which TISMO keeps despite no public landing page).
    const studyChips = (t.studies || []).map(s => {
      if (/^GSE\d+$/.test(s)) {
        return `<a href="https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${s}" target="_blank" rel="noopener" style="background:#dcfce7; color:#15803d; padding:1px 6px; border-radius:10px; font-size:10px; text-decoration:none; border:1px solid #bbf7d0; margin-right:3px;">${s} ↗</a>`;
      }
      return `<span style="background:#f3f4f6; color:#6b7280; padding:1px 6px; border-radius:10px; font-size:10px; border:1px solid #e5e7eb; margin-right:3px;">${s}</span>`;
    }).join('');
    const icbBadge = (t.icbTreatedSamples || 0) > 0
      ? `<span class="badge" style="background:#dcfce7; color:#15803d; border-color:#bbf7d0;">${t.icbTreatedSamples} ICB-arm samples</span>`
      : `<span class="badge" style="background:#f3f4f6; color:#6b7280; border-color:#e5e7eb;">no ICB arm</span>`;
    const portalLink = `https://tismo.pku-genomics.org/#/databrowser`;
    const fields = [];
    if (t.vitroSamples) fields.push(`<b>${t.vitroSamples}</b> in-vitro`);
    if (t.vivoSamples)  fields.push(`<b>${t.vivoSamples}</b> in-vivo`);
    const sampleLine = fields.join(' · ');
    const treatmentLine = (t.icbTreatments && t.icbTreatments.length)
      ? `<div class="field"><div class="k">ICB / drug arms</div><div class="v">${t.icbTreatments.join(', ')}</div></div>`
      : '';
    const strainLine = (t.mouseStrains && t.mouseStrains.length)
      ? `<div class="field"><div class="k">Host strains used</div><div class="v">${t.mouseStrains.join(', ')}</div></div>`
      : '';
    return `
      <div class="section-title">TISMO record</div>
      <div style="font-size:11px; color:var(--gray-500); margin-bottom:6px;">
        Cell line is catalogued in <a href="${portalLink}" target="_blank" rel="noopener" style="color:var(--green-700);">TISMO ↗</a> (Tumor Immune Syngeneic MOuse). Raw RNA-seq + ICB-treatment data are at the GEO accessions below.
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
        ${icbBadge}
        ${t.originYear ? `<span class="badge" style="background:#f3f4f6; color:#6b7280;">est. ${t.originYear}</span>` : ''}
        ${t.parent ? `<span class="badge" style="background:#eef2ff; color:#3730a3; border-color:#c7d2fe;">child of ${t.parent}</span>` : ''}
      </div>
      ${sampleLine ? `<div class="field"><div class="k">Samples</div><div class="v">${sampleLine}</div></div>` : ''}
      ${treatmentLine}
      ${strainLine}
      ${t.origin ? `<div class="field"><div class="k">Origin (TISMO)</div><div class="v">${t.origin}</div></div>` : ''}
      ${studyChips ? `<div style="margin-top:8px;"><div style="font-size:11px; color:var(--gray-500); margin-bottom:4px;">Studies (${(t.studies||[]).length}):</div>${studyChips}</div>` : ''}
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
      return `<div class="cl-row${cl === state.activeId ? ' active' : ''}" data-cl="${cl}" title="${cl}">`
        + `<span class="sex ${sx.cls}" title="${sx.title}">${sx.sym}</span>`
        + `<span class="name">${name}${tierTag}${tismoTag}</span>`
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
    if (f.tier)    chips.push(chip(f.tier === '1' ? 'Tier 1 only' : 'Tier 1 + 2', () => { f.tier = ''; document.getElementById('filterTier').value = ''; render(); }));
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

  // ---------- detail pane ----------
  function renderDetail(cl) {
    const pane = document.getElementById('detail-pane');
    if (!cl) {
      pane.innerHTML = '<div class="placeholder">Pick a cell line from the list to see its details.</div>';
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
      <h2>${name} ${tierBadge} ${modelBadge} ${sexBadge}</h2>
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
