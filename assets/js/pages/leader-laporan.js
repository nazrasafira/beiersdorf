Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['leader', 'manager'], teamPicker: true });
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

  const PAGE = 20; // reports per page
  let page = 1;

  function render() {
    const ids = $('spg').value ? [$('spg').value] : spgs.map(u => u.id);
    let from = $('from').value || D.DATA_START, to = $('to').value || D.TODAY;
    if (from > to) { [from, to] = [to, from]; $('from').value = from; $('to').value = to; } // keep the fields in order too
    const storeId = $('store').value;
    const storeName = id => (D.store(id) || {}).name || '';
    const storesOf = r => [...new Set(D.getTransactions(r).map(t => t.storeId))];
    const list = D.listReports({ userIds: ids, from, to }).filter(r => !storeId || storesOf(r).includes(storeId));
    App.trendChart($('trend'), D.dailySeries(ids, [teamId], from, to, storeId || null));
    const total = list.reduce((a, r) => a + r.total, 0);
    $('summary').innerHTML = `<b>${list.length}</b> laporan · Total <b>${App.rp(total)}</b>`;

    if (!list.length) { $('table').innerHTML = '<p class="empty">Tidak ada laporan pada filter ini.</p>'; $('pager').hidden = true; return; }

    // One card per SPG-day: date, SPG, stores, total; buttons to see the sales, edit, and lock/unlock
    const [pf, pt, at] = App.pager($('pager'), { page, size: PAGE, total: list.length, label: 'laporan', onPage: n => { page = n; render(); $('summary').scrollIntoView({ block: 'start', behavior: 'smooth' }); } });
    page = at;
    $('table').innerHTML = list.slice(pf, pt).map(r => {
      const u = D.user(r.userId);
      const key = r.userId + '|' + r.date;
      const tx = D.getTransactions(r);
      const lockedByTime = r.date < D.addDays(D.TODAY, -D.getSettings(teamId).editDays);
      const stores = storesOf(r).map(storeName).join(', ') || storeName(D.storeFor(r.userId, r.date, ''));
      return `<div class="rep">
        <div class="rep-top">
          ${App.person(u, App.dateShort(r.date) + (stores ? ' · ' + stores : ''))}
          <div class="rep-total"><b>${App.rpShort(r.total)}</b><small>${r.noSales ? 'tidak ada penjualan' : tx.length + ' transaksi'}</small></div>
        </div>
        <div class="rep-actions">
          <button type="button" class="btn ghost small" data-toggle="${key}" aria-expanded="false">${App.icon('chevDown')}Rincian${hasPhotos(r) ? ' · foto' : ''}</button>
          <a class="btn ghost small" href="${App.page('../spg/laporan.html')}?spg=${encodeURIComponent(r.userId)}&tanggal=${r.date}">${App.icon('pencil')}Ubah</a>
          ${lockedByTime ? `<button type="button" class="btn ghost small ${r.unlocked ? '' : 'locked'}" data-lock="${key}">${App.icon(r.unlocked ? 'unlock' : 'lock')}${r.unlocked ? 'Kunci lagi' : 'Buka kunci'}</button>` : ''}
        </div>
        <div class="rep-detail" data-detail="${key}" hidden>
          ${shiftLine(r)}
          ${r.noSales ? '<p class="muted small">Tidak ada penjualan.</p>' : `<div class="rows">${tx.map(t => `<div>
            ${App.productImg(D.product(t.productId))}
            <div class="grow"><b>${App.esc(D.product(t.productId).name)}</b><span>${[t.time, App.esc(storeName(t.storeId))].filter(Boolean).join(' · ')} · ${t.qty} × ${App.num(t.price)}</span></div>
            <div class="val">${App.num(t.qty * t.price)}</div>
          </div>`).join('')}</div>`}
        </div>
      </div>`;
    }).join('');
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
    const t = e.target.closest('[data-toggle]');
    if (t) {
      const d = $('table').querySelector(`[data-detail="${t.dataset.toggle}"]`);
      d.hidden = !d.hidden;
      t.setAttribute('aria-expanded', !d.hidden);
    }
  });
  ['spg', 'store', 'from', 'to'].forEach(id => $(id).addEventListener('change', () => { page = 1; render(); }));
  render();
});
