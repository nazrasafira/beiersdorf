Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['leader', 'supervisor'], teamPicker: true });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const teamId = App.teamId(user);
  const spgs = D.spgsOf(teamId, true);

  $('sub').textContent = 'Tim ' + D.team(teamId).name;
  const pre = App.param('spg');
  $('spg').innerHTML = `<option value="">Semua SPG</option>` + spgs.map(u =>
    `<option value="${u.id}" ${u.id === pre ? 'selected' : ''}>${App.esc(u.name)}${u.active ? '' : ' (nonaktif)'}</option>`).join('');
  App.combobox($('spg'));
  $('store').innerHTML = '<option value="">Semua toko</option>' + D.stores(true).map(s => `<option value="${s.id}">${App.esc(s.name)}</option>`).join('');
  App.combobox($('store'));
  $('from').value = D.monthStart(D.TODAY);
  $('to').value = D.TODAY;
  $('from').max = $('to').max = D.TODAY;

  function shiftLine(r) {
    const sh = D.getShift(r.userId, r.date);
    if (!sh) return '';
    const photos = sh.photos || [];
    return `<p class="small muted" style="margin:0 0 8px">Shift ${sh.start}–${sh.end || 'sekarang'}${photos.length ? ` · Foto catatan (${photos.length})` : ''}</p>`
      + (photos.length ? App.notePhotos(photos) : '');
  }

  const hasPhotos = r => { const sh = D.getShift(r.userId, r.date); return !!(sh && sh.photos && sh.photos.length); };

  const TT = { placeholder: 'Cari SPG, tanggal, toko...' };

  function render() {
    const ids = $('spg').value ? [$('spg').value] : spgs.map(u => u.id);
    let from = $('from').value || D.DATA_START, to = $('to').value || D.TODAY;
    if (from > to) [from, to] = [to, from];
    const storeId = $('store').value;
    const storeName = id => (D.store(id) || {}).name || '';
    const storesOf = r => [...new Set(D.getTransactions(r).map(t => t.storeId))];
    const list = D.listReports({ userIds: ids, from, to }).filter(r => !storeId || storesOf(r).includes(storeId));
    App.trendChart($('trend'), D.dailySeries(ids, [teamId], from, to, storeId || null));
    const total = list.reduce((a, r) => a + r.total, 0);
    $('summary').innerHTML = `<b>${list.length}</b> laporan · Total <b>${App.rp(total)}</b>`;

    if (!list.length) { $('table').innerHTML = '<tbody><tr><td class="empty">Tidak ada laporan pada filter ini.</td></tr></tbody>'; App.tableTools($('table'), TT); return; }

    $('table').innerHTML = `
      <thead><tr><th>Tanggal</th><th>SPG</th><th class="num">Transaksi</th><th class="num">Total (Rp)</th><th></th></tr></thead>
      <tbody>${list.map(r => {
        const u = D.user(r.userId);
        const key = r.userId + '|' + r.date;
        const lockedByTime = r.date < D.addDays(D.TODAY, -D.getSettings(teamId).editDays);
        const lockBtn = lockedByTime
          ? App.iconBtn(r.unlocked ? 'unlock' : 'lock', r.unlocked ? 'Terbuka untuk SPG. Klik untuk kunci lagi' : 'Terkunci. Klik untuk buka', `data-lock="${key}"`, r.unlocked ? 'primary' : '')
          : '';
        return `<tr class="click" data-key="${key}">
            <td>${App.dateShort(r.date)}</td>
            <td>${App.person(u, storesOf(r).map(storeName).join(', ') || storeName(D.storeFor(r.userId, r.date, '')))}</td>
            <td class="num">${r.noSales ? '–' : D.getTransactions(r).length}</td>
            <td class="num">${App.num(r.total)}</td>
            <td class="num"><span class="icon-group">${hasPhotos(r) ? `<span class="icon-btn" title="Ada foto catatan" aria-label="Ada foto catatan">${App.icon('camera')}</span>` : ''}${App.iconLink(`${App.page('../spg/laporan.html')}?spg=${encodeURIComponent(r.userId)}&tanggal=${r.date}`, 'pencil', 'Ubah laporan')}${lockBtn}</span></td>
          </tr>
          <tr class="detail" data-detail="${key}" hidden><td colspan="5">
            ${shiftLine(r)}
            ${r.noSales ? '<i>Tidak ada penjualan.</i>' : `<table>
              <thead><tr><th>Waktu</th><th>Toko</th><th>Produk</th><th class="num">Qty</th><th class="num">Harga</th><th class="num">Subtotal</th></tr></thead>
              <tbody>${D.getTransactions(r).map(t => `<tr><td>${t.time || '–'}</td><td>${App.esc(storeName(t.storeId))}</td><td><span class="tx">${App.productImg(D.product(t.productId))}${App.esc(D.product(t.productId).name)}</span></td><td class="num">${t.qty}</td><td class="num">${App.num(t.price)}</td><td class="num">${App.num(t.qty * t.price)}</td></tr>`).join('')}</tbody>
            </table>`}
          </td></tr>`;
      }).join('')}</tbody>`;
    App.tableTools($('table'), TT);
  }

  $('table').addEventListener('click', e => {
    const lock = e.target.closest('[data-lock]');
    if (lock) {
      const [uid, date] = lock.dataset.lock.split('|');
      const r = D.getReport(uid, date);
      D.setUnlocked(uid, date, !r.unlocked);
      App.toast(r.unlocked ? 'Laporan dibuka, SPG bisa mengubah' : 'Laporan dikunci lagi');
      render();
      return;
    }
    if (e.target.closest('a')) return;
    const tr = e.target.closest('tr.click');
    if (tr) { const d = $('table').querySelector(`[data-detail="${tr.dataset.key}"]`); d.hidden = !d.hidden; }
  });
  ['spg', 'store', 'from', 'to'].forEach(id => $(id).addEventListener('change', render));
  render();
});
