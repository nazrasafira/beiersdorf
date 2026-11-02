/* Laporan, tab Pencapaian: target and offtake of a date range per SPG and per store, best first.
 * Numbers come from the server (apps-script/Achievement.gs). */
window.PencapaianTab = function (teamId, teamName) {
  'use strict';
  const D = Data, $ = id => document.getElementById(id);
  let by = 'spgs', data = null, seq = 0;
  const paged = App.pagedList($('achList'), { label: 'baris', rows: '.ach-row:not(.ach-headrow)' });

  const dot = ach => (ach === null ? '' : `<i class="ach-dot ${ach >= 1 ? 'hi' : ach >= 0.9 ? 'mid' : 'lo'}"></i>`);
  const achText = ach => (ach === null ? '–' : Math.round(ach * 100) + '%');
  const source = r => (!r.offtake ? '' : r.fromActual && r.fromSpg ? 'Laporan toko + penjualan harian' : r.fromActual ? 'Laporan toko' : 'Penjualan harian');

  function render() {
    const rows = data[by];
    const target = rows.reduce((a, r) => a + r.target, 0), offtake = rows.reduce((a, r) => a + r.offtake, 0);
    const ach = target > 0 ? offtake / target : null;
    const fromActual = rows.filter(r => r.fromActual).length;
    $('achStats').innerHTML = [
      ['Target', App.rp(target), ''],
      ['Offtake', App.rp(offtake), ''],
      ['Pencapaian', `${dot(ach)} ${achText(ach)}`, ach === null ? 'belum ada target' : ach >= 1 ? 'tercapai' : `kurang ${App.rp(target - offtake)}`],
      ['Pakai laporan toko', `${fromActual} dari ${rows.length}`, by === 'spgs' ? 'SPG' : 'toko'],
    ].map(([k, v, s]) => `<div><span>${k}</span><b>${v}</b>${s ? `<small>${App.esc(s)}</small>` : ''}</div>`).join('');
    const figs = r => `<div class="ach-figs"><span class="ach-val"><small>Target</small>${App.num(r.target)}</span><span class="ach-val"><small>Offtake</small>${App.num(r.offtake)}</span></div>`;
    $('achList').innerHTML = rows.length ? `<div class="ach-row ach-headrow" aria-hidden="true"><span class="ach-rank">#</span><span class="ach-name" style="font-weight:600">${by === 'spgs' ? 'SPG' : 'Toko'}</span><div class="ach-figs"><span class="ach-val">Target</span><span class="ach-val">Offtake</span></div><span class="ach-pct">Ach%</span></div>` +
      rows.map((r, i) => `<div class="ach-row">
        <span class="ach-rank">${i + 1}</span>
        <span class="ach-name">${App.esc(r.name)}${source(r) ? `<small>${source(r)}</small>` : ''}</span>
        ${figs(r)}
        <span class="ach-pct">${dot(r.ach)}${achText(r.ach)}</span>
      </div>`).join('') : '<p class="empty">Belum ada data di rentang ini.</p>';
    paged.apply();
    $('achExcel').hidden = !rows.length;
    $('achNote').textContent = 'Offtake memakai laporan toko bulanan yang diisi SPG, dan penjualan harian bila belum diisi. Toko dan bulan tanpa target tidak dihitung.';
    $('achExcluded').hidden = !data.excluded;
    $('achExcluded').textContent = `${App.rp(data.excluded)} penjualan tim terjadi di toko dan bulan tanpa target.`;
  }
  async function load() {
    let from = $('achFrom').value, to = $('achTo').value;
    if (!from || !to) return;
    if (from > to) { [from, to] = [to, from]; $('achFrom').value = from; $('achTo').value = to; }
    const mine = ++seq;
    paged.reset();
    $('achStats').innerHTML = '';
    $('achList').innerHTML = '<p class="empty">Memuat...</p>';
    $('achExcel').hidden = true;
    const res = await D.achievementReport({ teamId, from, to });
    if (mine !== seq) return;
    if (res.error) { data = null; $('achList').innerHTML = `<p class="empty">${App.esc(res.error)}</p>`; return; }
    data = res;
    render();
  }

  $('achFrom').max = $('achTo').max = D.TODAY;
  $('achFrom').value = D.TODAY.slice(0, 4) + '-01-01';
  $('achTo').value = D.TODAY;
  ['achFrom', 'achTo'].forEach(id => $(id).addEventListener('change', load));
  $('achPresets').addEventListener('click', e => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    const first = D.monthStart(D.TODAY);
    $('achFrom').value = b.dataset.p === 'month' ? first : b.dataset.p === 'quarter' ? D.addMonths(D.monthKey(first), -2) + '-01' : D.TODAY.slice(0, 4) + '-01-01';
    $('achTo').value = D.TODAY;
    load();
  });
  $('achBy').addEventListener('click', e => {
    const b = e.target.closest('button[data-k]');
    if (!b) return;
    by = b.dataset.k;
    $('achBy').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    paged.reset();
    if (data) render();
  });
  $('achExcel').addEventListener('click', async () => {
    if (!data) return;
    try { await RecapExport.downloadAchievement(data, teamName); } catch (err) { App.toast('Export gagal. Periksa koneksi internet lalu coba lagi.'); }
  });

  return { open() { if (!data) load(); } };
};
