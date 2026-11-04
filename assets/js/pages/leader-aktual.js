/* Laporan, tab Sell In & Offtake: the Team Leader enters what Nivea sold to each store and sees which stores are done.
 * Offtake is the monthly figure the SPG enters from the store's report (spg/riwayat.html, called actual in the code and Sheet).
 * Numbers come from the server (apps-script/Actuals.gs). */
window.AktualTab = function (teamId, teamName) {
  'use strict';
  const D = Data, $ = id => document.getElementById(id);
  const FLAG_PCT = 10;
  const STATUS = {
    empty: ['Belum ada data', 'bad'],
    sellIn: ['Belum isi sell in', 'warn'],
    waiting: ['Menunggu SPG', ''],
    done: ['Lengkap', 'ok'],
  };
  const ORDER = ['empty', 'sellIn', 'waiting', 'done']; // stores that still need work first

  let scope = 'team', filter = 'all';
  let month = D.monthKey(D.TODAY);
  let data = null, seq = 0;
  const edits = new Map(); // storeId → typed sell in that differs from the saved one
  const paged = App.pagedList($('inputs'), { label: 'toko', rows: '.ax-row' }); // rows on other pages keep what was typed

  const has = v => v !== null && v !== undefined;
  const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + App.rp(Math.abs(n));
  const place = r => [r.chain, r.city].filter(Boolean).join(' · ');
  const statusOf = r => (has(r.sellIn) ? (has(r.actual) ? 'done' : 'waiting') : has(r.actual) ? 'sellIn' : 'empty');
  const inScope = r => scope === 'all' || r.held;
  const inSearch = r => {
    const q = $('search').value.trim().toLowerCase();
    return !q || (r.name + ' ' + place(r) + ' ' + r.spg).toLowerCase().includes(q);
  };
  const inFilter = r => {
    const st = statusOf(r);
    return filter === 'all' || (filter === 'sellIn' ? !has(r.sellIn) : filter === st);
  };
  const flagged = r => r.actual > 0 && Math.abs(r.sellOut - r.actual) / r.actual * 100 > FLAG_PCT;

  /* ----- Loading ----- */
  async function load() {
    const mine = ++seq;
    $('axPeriod').textContent = App.monthName(month);
    $('next').disabled = month >= D.monthKey(D.TODAY);
    $('axBody').hidden = true;
    $('axStatus').hidden = false;
    $('axStatus').innerHTML = App.loadingText;
    const res = await D.actualsReport({ teamId, month });
    if (mine !== seq) return;
    if (res.error) { $('axStatus').textContent = res.error; return; }
    show(res);
  }
  function show(res) {
    data = res;
    edits.clear();
    $('axNoArea').hidden = !res.storesWithoutArea;
    $('axNoArea').textContent = `${res.storesWithoutArea} toko belum punya area, jadi tidak muncul di sini. Lengkapi di Katalog.`;
    data.rows.sort((a, b) => ORDER.indexOf(statusOf(a)) - ORDER.indexOf(statusOf(b)) || (b.held - a.held) || String(a.name).localeCompare(String(b.name)));
    renderRows();
    $('axBody').hidden = false;
    refresh();
  }

  /* ----- Rows ----- */
  const sellInInput = (r, i) => `<input class="input" id="in-${i}" data-sellin type="text" placeholder="Isi sell in" aria-label="Sell in ${App.esc(r.name)}">`;
  const sellInSaved = r => `<span class="ax-saved"><b>${App.rp(r.sellIn)}</b><button type="button" class="btn ghost small" data-edit>${App.icon('pencil')}Ubah</button></span>`;
  function renderRows() {
    $('inputs').innerHTML = data.rows.map((r, i) => {
      const [label, cls] = STATUS[statusOf(r)];
      return `<div class="ax-row" data-store="${App.esc(r.storeId)}" data-i="${i}">
        <div class="ax-store">
          <b>${App.esc(r.name)}</b>
          <small>${App.esc([place(r), r.spg ? 'SPG: ' + r.spg : 'Tidak ada SPG'].filter(Boolean).join(' · '))}</small>
          ${r.note ? `<small class="ax-rownote">Catatan SPG: ${App.esc(r.note)}</small>` : ''}
        </div>
        <div class="ax-state"><span class="pill ${cls}">${label}</span></div>
        <div class="ax-cell" data-cell><label for="in-${i}">Sell in</label>${has(r.sellIn) ? sellInSaved(r) : sellInInput(r, i)}</div>
        <div class="ax-cell"><span class="ax-lbl">Offtake</span>${has(r.actual) ? `<b>${App.rp(r.actual)}</b>` : '<span class="muted small">Belum diisi SPG</span>'}</div>
        <div class="ax-cell"><span class="ax-lbl">Penjualan harian</span><b>${App.rp(r.sellOut)}</b></div>
        <div class="ax-cell"><span class="ax-lbl">Selisih</span>${r.actual
          ? `<b class="${flagged(r) ? 'num-warn' : ''}">${signed(r.sellOut - r.actual)}</b><small class="ax-sub">${flagged(r) ? 'Perlu dicek · ' : ''}${App.pct(r.sellOut / r.actual * 100)} dari offtake</small>`
          : '<span class="muted small">–</span>'}</div>
      </div>`;
    }).join('');
    $('inputs').querySelectorAll('[data-sellin]').forEach(i => App.moneyInput(i));
  }
  function refresh() {
    const rows = data.rows.filter(inScope);
    renderProgress(rows);
    const found = rows.filter(inSearch);
    const count = k => found.filter(r => k === 'all' || (k === 'sellIn' ? !has(r.sellIn) : statusOf(r) === k)).length;
    $('axFilter').querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', b.dataset.k === filter);
      b.querySelector('span').textContent = count(b.dataset.k);
    });
    const shown = paged.apply(row => { const r = data.rows[+row.dataset.i]; return inScope(r) && inSearch(r) && inFilter(r); });
    $('axTable').hidden = !shown;
    $('axStatus').hidden = shown > 0;
    $('axStatus').textContent = filter !== 'all' ? 'Tidak ada toko dengan status ini.'
      : scope === 'team' && !$('search').value ? 'Belum ada toko tim di bulan ini. Lihat Semua area.' : 'Tidak ada toko yang cocok.';
    renderTotals(found);
    renderDirty();
  }
  function renderProgress(rows) {
    const line = (label, n) => {
      const pct = rows.length ? Math.round(n / rows.length * 100) : 0;
      return `<div class="ax-prog"><span>${label}</span><div class="ax-track"><i class="${n === rows.length && n ? 'full' : ''}" style="width:${pct}%"></i></div><b>${n} dari ${rows.length} toko</b></div>`;
    };
    $('axProgress').innerHTML = line('Sell in', rows.filter(r => has(r.sellIn)).length) + line('Offtake', rows.filter(r => has(r.actual)).length);
  }
  function renderTotals(rows) {
    const sum = (list, k) => list.reduce((a, r) => a + (r[k] || 0), 0);
    const filled = rows.filter(r => r.actual);
    const flags = filled.filter(flagged).length;
    $('axTotals').innerHTML = [
      ['Sell in', App.rp(sum(rows, 'sellIn'))],
      ['Offtake', App.rp(sum(filled, 'actual'))],
      ['Penjualan harian', App.rp(sum(rows, 'sellOut'))],
      ['Selisih', filled.length ? `${signed(sum(filled, 'sellOut') - sum(filled, 'actual'))}${flags ? ` · ${flags} perlu dicek` : ''}` : '–'],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  }
  function renderDirty() {
    $('axFoot').hidden = !edits.size;
    $('dirtyText').textContent = `${edits.size} toko belum disimpan`;
    $('inputs').querySelectorAll('.ax-row').forEach(row => row.classList.toggle('changed', edits.has(row.dataset.store)));
  }

  $('inputs').addEventListener('click', e => {
    if (!e.target.closest('[data-edit]')) return;
    const row = e.target.closest('.ax-row'), i = +row.dataset.i, r = data.rows[i];
    const cell = row.querySelector('[data-cell]');
    cell.querySelector('.ax-saved').remove();
    cell.insertAdjacentHTML('beforeend', sellInInput(r, i));
    const input = cell.querySelector('[data-sellin]');
    App.moneyInput(input);
    App.setMoney(input, r.sellIn);
    input.focus();
  });
  $('inputs').addEventListener('input', e => {
    if (!e.target.matches('[data-sellin]')) return;
    const row = e.target.closest('.ax-row'), r = data.rows[+row.dataset.i];
    const value = e.target.value ? App.parseNum(e.target.value) : null;
    if (value === r.sellIn) edits.delete(r.storeId); else edits.set(r.storeId, value);
    renderDirty();
  });
  $('inputForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!edits.size) return;
    const rows = [...edits].map(([storeId, sellIn]) => ({ storeId, sellIn }));
    const res = await App.busy($('inputForm'), () => D.saveSellIn({ teamId, month, rows }));
    if (res.error) { App.toast(res.error); return; }
    App.toast(`Sell in ${rows.length} toko tersimpan.`);
    show(res);
  });
  $('axExcel').addEventListener('click', async () => {
    if (!data) return;
    try { await RecapExport.downloadSellIn(data.rows.filter(inScope).filter(inSearch).filter(inFilter), month, teamName); } catch (err) { App.toast('Export gagal. Periksa koneksi internet lalu coba lagi.'); }
  });

  /* ----- Controls ----- */
  async function leaveOk() {
    return !edits.size || App.confirm('Sell in yang belum disimpan akan hilang.', { title: 'Tinggalkan perubahan?', ok: 'Tinggalkan', danger: true });
  }
  window.addEventListener('beforeunload', e => { if (edits.size) e.preventDefault(); });
  $('axFilter').addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) { filter = b.dataset.k; paged.reset(); refresh(); } });
  $('scope').addEventListener('click', e => {
    const b = e.target.closest('button[data-k]');
    if (!b) return;
    scope = b.dataset.k;
    $('scope').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    paged.reset();
    if (data) refresh();
  });
  $('prev').addEventListener('click', async () => { if (await leaveOk()) { month = D.addMonths(month, -1); paged.reset(); load(); } });
  $('next').addEventListener('click', async () => { if (month < D.monthKey(D.TODAY) && await leaveOk()) { month = D.addMonths(month, 1); paged.reset(); load(); } });
  $('search').addEventListener('input', () => { paged.reset(); if (data) refresh(); });

  return {
    open() { if (!data) load(); },
    // Before leaving this tab: false when the user wants to stay with their unsaved numbers
    async leave() {
      if (!await leaveOk()) return false;
      if (edits.size) { edits.clear(); renderRows(); refresh(); }
      return true;
    },
  };
};
