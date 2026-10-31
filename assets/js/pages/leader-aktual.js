/* Laporan, tab Sell In & Actual: the Team Leader types in what Nivea sold to each store and what the store reports it sold,
 * next to what the SPGs reported, on one screen. Numbers come from the server (apps-script/Actuals.gs). */
window.AktualTab = function (teamId) {
  'use strict';
  const D = Data, $ = id => document.getElementById(id);
  const FLAG_PCT = 10;

  let type = 'month', scope = 'team';
  let start = D.monthStart(D.TODAY);
  let data = null, seq = 0;
  const dirty = new Set();
  const paged = App.pagedList($('inputs'), { label: 'toko' }); // rows on other pages keep what was typed

  const money = n => (n === null || n === undefined ? '–' : App.rp(n));
  const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + App.rp(Math.abs(n));
  const place = r => [r.chain, r.city].filter(Boolean).join(' · ');
  const periodLabel = () => (type === 'month' ? App.monthName(D.monthKey(start)) : `${App.dateShort(start)} – ${App.dateShort(D.addDays(start, 6))}`);
  const step = dir => (type === 'month' ? D.addMonths(D.monthKey(start), dir) + '-01' : D.addDays(start, dir * 7));
  const setTabs = (id, k) => $(id).querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
  const gapOf = r => (r.actual ? r.sellOut - r.actual : null);
  const flagged = r => r.actual > 0 && Math.abs(r.sellOut - r.actual) / r.actual * 100 > FLAG_PCT;
  const matches = r => {
    const q = $('search').value.trim().toLowerCase();
    return (scope === 'all' || r.held) && (!q || (r.name + ' ' + place(r)).toLowerCase().includes(q));
  };
  const shown = () => data.rows.filter(matches);
  const gapHtml = r => (r.actual
    ? `<span class="${flagged(r) ? 'num-warn' : ''}">${signed(gapOf(r))}</span><small>${flagged(r) ? 'Cek · ' : ''}${App.pct(r.sellOut / r.actual * 100)} dari actual</small>`
    : '<small>Belum diisi</small>');

  /* ----- Loading ----- */
  async function load() {
    const mine = ++seq;
    $('axPeriod').textContent = periodLabel();
    $('next').disabled = step(1) > D.TODAY;
    $('axStatus').hidden = false;
    $('axStatus').textContent = 'Memuat...';
    $('inputForm').hidden = true;
    $('axSummary').innerHTML = '';
    const res = await D.actualsReport({ teamId, periodType: type, start });
    if (mine !== seq) return;
    if (res.error) { $('axStatus').textContent = res.error; return; }
    show(res);
  }
  function show(res) {
    data = res;
    dirty.clear();
    $('axNoArea').hidden = !res.storesWithoutArea;
    $('axNoArea').textContent = `${res.storesWithoutArea} toko belum punya area, jadi tidak muncul di sini. Lengkapi di Katalog.`;
    renderRows();
    applyFilter();
  }

  /* ----- Rows ----- */
  function renderRows() {
    $('inputs').innerHTML = data.rows.map((r, i) => {
      const locked = r.mode !== 'own';
      const lockText = r.mode === 'weeks' ? `Diisi per minggu (${r.weeks} minggu)` : 'Diisi per bulan';
      return `<div class="ax-row" data-store="${App.esc(r.storeId)}" data-i="${i}">
        <div class="ax-store"><b>${App.esc(r.name)}</b><small>${App.esc([place(r), r.spg ? 'SPG: ' + r.spg : 'Tidak ada SPG'].filter(Boolean).join(' · '))}</small></div>
        <div class="ax-cell"><label for="in-${i}">Sell in</label><input class="input" id="in-${i}" data-f="sellIn" type="text" aria-label="Sell in ${App.esc(r.name)}" ${locked ? 'disabled' : ''}></div>
        <div class="ax-cell"><label for="ac-${i}">Actual</label><input class="input" id="ac-${i}" data-f="actual" type="text" aria-label="Actual ${App.esc(r.name)}" ${locked ? 'disabled' : ''}></div>
        <div class="ax-cell ax-num"><span class="ax-lbl">Sell out SPG</span>${money(r.sellOut)}</div>
        <div class="ax-cell ax-num"><span class="ax-lbl">Selisih</span><span data-gap>${gapHtml(r)}</span></div>
        <div class="ax-cell ax-note">${locked ? `<small class="muted">${App.esc(lockText)}</small>` : `<label for="no-${i}">Catatan</label><input class="input" id="no-${i}" data-f="note" type="text" maxlength="200" placeholder="Opsional" aria-label="Catatan ${App.esc(r.name)}" value="${App.esc(r.note || '')}">`}</div>
      </div>`;
    }).join('');
    $('inputs').querySelectorAll('.ax-row').forEach(row => {
      const r = data.rows[+row.dataset.i];
      const inp = row.querySelector('[data-f=sellIn]'), act = row.querySelector('[data-f=actual]');
      App.moneyInput(inp); App.moneyInput(act);
      App.setMoney(inp, r.sellIn); App.setMoney(act, r.actual);
    });
    renderDirty();
  }
  function applyFilter() {
    if (!data) return;
    const count = paged.apply(row => matches(data.rows[+row.dataset.i]));
    $('inputForm').hidden = !count;
    $('axStatus').hidden = count > 0;
    $('axStatus').textContent = scope === 'team' && !$('search').value ? 'Belum ada toko tim di periode ini. Lihat Semua area.' : 'Tidak ada toko yang cocok.';
    renderStats();
  }
  function renderStats() {
    const rows = shown(), filled = rows.filter(r => r.actual);
    const sum = (list, k) => list.reduce((a, r) => a + (r[k] || 0), 0);
    const flags = filled.filter(flagged).length;
    $('axSummary').innerHTML = [
      ['Sell in', money(sum(rows, 'sellIn')), 'referensi'],
      ['Sell out SPG', money(sum(rows, 'sellOut')), `${rows.length} toko`],
      ['Actual', money(sum(filled, 'actual')), `${filled.length} dari ${rows.length} toko terisi`],
      ['Selisih', filled.length ? signed(sum(filled, 'sellOut') - sum(filled, 'actual')) : '–', filled.length ? `${flags} toko perlu dicek` : 'belum ada actual'],
    ].map(([k, v, s]) => `<div><span>${k}</span><b>${v}</b><small>${App.esc(s)}</small></div>`).join('');
  }
  function renderDirty() {
    $('axFoot').hidden = !dirty.size;
    $('dirtyText').textContent = `${dirty.size} toko belum disimpan`;
  }
  $('inputs').addEventListener('input', e => {
    const row = e.target.closest('.ax-row');
    if (!row) return;
    const r = data.rows[+row.dataset.i], value = row.querySelector('[data-f=' + (e.target.dataset.f) + ']').value;
    if (e.target.dataset.f === 'sellIn') r.sellIn = value ? App.parseNum(value) : null;
    if (e.target.dataset.f === 'actual') {
      r.actual = value ? App.parseNum(value) : null;
      row.querySelector('[data-gap]').innerHTML = gapHtml(r);
    }
    if (e.target.dataset.f === 'note') r.note = value;
    dirty.add(row.dataset.store);
    renderDirty();
    renderStats();
  });
  $('inputForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!dirty.size) return;
    const rows = data.rows.filter(r => dirty.has(r.storeId)).map(r => ({ storeId: r.storeId, sellIn: r.sellIn, actual: r.actual, note: r.note || '' }));
    const res = await App.busy($('inputForm'), () => D.saveActuals({ teamId, periodType: type, start, rows }));
    if (res.error) { App.toast(res.error); return; }
    App.toast(`${rows.length} toko tersimpan.`);
    show(res);
  });
  $('csv').addEventListener('click', () => {
    if (!data) return;
    App.downloadCsv(`sell-in-actual-${type === 'month' ? D.monthKey(start) : start}.csv`, [
      ['Toko', 'Kota', 'SPG', 'Dari', 'Sampai', 'Sell in', 'Sell out SPG', 'Actual', 'Selisih', 'Sell out / actual (%)', 'Catatan'],
    ].concat(shown().map(r => [
      r.name, r.city, r.spg, r.from, r.to, r.sellIn, r.sellOut, r.actual, gapOf(r), r.actual ? Math.round(r.sellOut / r.actual * 100) : '', r.note,
    ])));
  });

  /* ----- Controls ----- */
  async function leaveOk() {
    return !dirty.size || App.confirm('Angka yang belum disimpan akan hilang.', { title: 'Tinggalkan perubahan?', ok: 'Tinggalkan', danger: true });
  }
  window.addEventListener('beforeunload', e => { if (dirty.size) e.preventDefault(); });
  const onTab = (id, fn) => $(id).addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) fn(b.dataset.k); });
  onTab('scope', k => { scope = k; setTabs('scope', k); paged.reset(); applyFilter(); });
  onTab('type', async k => {
    if (k === type || !await leaveOk()) return;
    if (k === 'month') start = D.monthStart(start);
    else start = D.monthKey(start) === D.monthKey(D.TODAY) ? D.weekStart(D.TODAY) : firstMonday(start);
    type = k; setTabs('type', k); paged.reset(); load();
  });
  function firstMonday(monthFirst) {
    const w = D.weekStart(monthFirst);
    return w < monthFirst ? D.addDays(w, 7) : w;
  }
  $('prev').addEventListener('click', async () => { if (await leaveOk()) { start = step(-1); paged.reset(); load(); } });
  $('next').addEventListener('click', async () => { if (step(1) <= D.TODAY && await leaveOk()) { start = step(1); paged.reset(); load(); } });
  $('search').addEventListener('input', () => { paged.reset(); applyFilter(); });

  return {
    open() { if (!data) load(); },
    // Before leaving this tab: false when the user wants to stay with their unsaved numbers. Dropped numbers come back from the server.
    async leave() {
      if (!await leaveOk()) return false;
      if (dirty.size) { dirty.clear(); load(); }
      return true;
    },
  };
};
