// MouseCLB — Mouse Cancer Cell Line Browser
// v0.2 — V2-CLB-style layout: filter bar (lineage / cancer type / model
// type / sex / tier), sort dropdown, sex glyph in each row, sectioned
// detail pane (Cancer classification → Identity → Mouse model →
// Clinical & genome → Immune context → Culture). Still identity-only;
// mutations / CN / expression sections will arrive once the matching
// data-processing scripts land.

(async function main() {
  const META_URL = 'web_data/metadata.json';

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
  document.getElementById('count-tag').textContent = `${meta.cellLines.length} cell lines`;

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
      return `<div class="cl-row${cl === state.activeId ? ' active' : ''}" data-cl="${cl}" title="${cl}">`
        + `<span class="sex ${sx.cls}" title="${sx.title}">${sx.sym}</span>`
        + `<span class="name">${name}${tierTag}</span>`
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
    const html = `
      <h2>${name} ${tierBadge} ${modelBadge} ${sexBadge}</h2>
      <div class="id">${cl} · MCCA</div>

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

      <div class="section-title">Immune context</div>
      ${row('MHC haplotype A',         meta.mhcA[cl])}
      ${row('MHC haplotype B',         meta.mhcB[cl])}
      ${row('Immunocompetent transplant', meta.immunocompetent[cl])}

      <div class="section-title">Culture & source</div>
      ${row('Curated name',     meta.curated[cl] || '<em style="color:#9ca3af;">not on curated list</em>')}
      ${row('Media',            meta.media[cl])}
      ${row('Culture system',   prettyValue(meta.cultureSystem[cl] || ''))}
      ${row('Source',           prettyValue(meta.source[cl] || ''))}
      ${row('Distributor',      meta.distributor[cl])}
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
