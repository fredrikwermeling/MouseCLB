// MouseCLB — Mouse Cancer Cell Line Browser
// v0.1 — minimal scaffold that loads metadata.json and renders the
// cell-line list + a basic detail pane. Next versions will add the
// Wiki modal, collections panel, mutation / CN / expression sections,
// and the executive summary — mirroring Correlate V2's CLB layout.

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
      `<div style="padding:20px; color:#991b1b;">Failed to load <code>${META_URL}</code>: ${e.message}.<br>Run <code>scripts/process_mcca_metadata.py</code> first.</div>`;
    return;
  }
  document.getElementById('count-tag').textContent = `${meta.cellLines.length} cell lines`;

  // ---------- list pane ----------
  const listEl = document.getElementById('cl-list');
  const searchEl = document.getElementById('search');

  let activeId = null;

  function render(filter) {
    const q = (filter || '').trim().toLowerCase();
    const html = [];
    for (const cl of meta.cellLines) {
      const name = meta.names[cl] || cl;
      const lineage = meta.lineage[cl] || '';
      const cancerType = meta.cancerType[cl] || '';
      const modelType = meta.modelType[cl] || '';
      const curated = meta.curated[cl];
      const tier = meta.curatedTier[cl];
      if (q) {
        const hay = [name, lineage, cancerType, modelType, curated || '', cl].join(' ').toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const tierTag = tier === 1 ? '<span class="tier-1">★ T1</span>'
                    : tier === 2 ? '<span class="tier-2">T2</span>' : '';
      html.push(
        `<div class="cl-row${cl === activeId ? ' active' : ''}" data-cl="${cl}">` +
        `<div class="name">${name}${tierTag}</div>` +
        `<div class="meta">${lineage} · ${cancerType || modelType || '—'} <span style="color:#9ca3af;">(${cl})</span></div>` +
        `</div>`
      );
    }
    listEl.innerHTML = html.join('') || '<div style="padding:20px; color:#9ca3af;">No matches.</div>';
  }

  function renderDetail(cl) {
    if (!cl) {
      document.getElementById('detail-pane').innerHTML =
        '<div class="placeholder">Pick a cell line from the list to see its details.</div>';
      return;
    }
    const name = meta.names[cl] || cl;
    const curated = meta.curated[cl];
    const tier = meta.curatedTier[cl];
    const tierBadge = tier === 1 ? '<span class="badge t1">Tier 1 — workhorse</span>'
                    : tier === 2 ? '<span class="badge t2">Tier 2</span>' : '';

    const row = (k, v) => v == null || v === '' ? '' :
      `<div class="field"><div class="k">${k}</div><div class="v">${v}</div></div>`;

    const html = `
      <h2>${name}${tierBadge}</h2>
      <div class="id">${cl} · MCCA</div>

      <h3 style="margin:0 0 8px; padding:6px 10px; font-size:14px; color:#15803d; background:#f0fdf4; border-left:3px solid #15803d; border-radius:0 4px 4px 0;">Identity & origin</h3>
      ${row('Curated name', curated || '<em style="color:#9ca3af;">not on curated list</em>')}
      ${row('Lineage', meta.lineage[cl])}
      ${row('Tissue', meta.tissue[cl])}
      ${row('Cancer type', meta.cancerType[cl])}
      ${row('Cancer type (detail)', meta.cancerTypeDetailed[cl])}
      ${row('Tumour location', meta.tumorLocation[cl])}
      ${row('Site', meta.site[cl])}
      ${row('Mouse model type', meta.modelType[cl])}
      ${row('Mouse model', meta.mouseModel[cl])}
      ${row('Mouse model (detail)', meta.mouseModelDetailed[cl])}
      ${row('Background strain', meta.strain[cl] + (meta.strainPct[cl] ? ' (' + (typeof meta.strainPct[cl] === 'number' ? meta.strainPct[cl].toFixed(0) + '%' : meta.strainPct[cl]) + ')' : ''))}
      ${row('MHC haplotype A', meta.mhcA[cl])}
      ${row('MHC haplotype B', meta.mhcB[cl])}
      ${row('Sex', meta.gender[cl])}
      ${row('Survival days', meta.survivalDays[cl])}
      ${row('Distant metastasis', meta.metastasis[cl])}
      ${row('Complex rearrangement', meta.complexRearrangement[cl])}
      ${row('Chromothripsis', meta.chromothripsis[cl])}
      ${row('Immunocompetent transplantation', meta.immunocompetent[cl])}
      ${row('Source', meta.source[cl])}
      ${row('Distributor', meta.distributor[cl])}
      ${row('Media', meta.media[cl])}
      ${row('Culture system', meta.cultureSystem[cl])}
      ${row('Morphology', meta.morphology[cl])}
      ${row('Morphology (detail)', meta.morphologyDetailed[cl])}
      ${row('PMID', meta.pmid[cl]
            ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${String(meta.pmid[cl]).split(/[ ,;]/)[0]}/" target="_blank" rel="noopener" style="color:#15803d;">${meta.pmid[cl]} ↗</a>`
            : null)}

      <div style="margin-top:18px; padding:10px 14px; background:#f9fafb; border-left:3px solid #6b7280; font-size:11px; color:#6b7280;">
        <b>Coming next:</b> Driver mutations, copy number, expression profile, FACS markers, executive summary, Wiki deep-dive modal, collections panel. v0.1 only shows the identity layer.
      </div>
    `;
    document.getElementById('detail-pane').innerHTML = html;
  }

  // ---------- events ----------
  searchEl.addEventListener('input', () => render(searchEl.value));
  listEl.addEventListener('click', (e) => {
    const row = e.target.closest('.cl-row');
    if (!row) return;
    activeId = row.dataset.cl;
    render(searchEl.value);
    renderDetail(activeId);
  });

  render('');
})();
