Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['leader', 'supervisor'], teamPicker: true });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const teamId = App.teamId(user);
  const team = D.team(teamId);
  let period = 'month';

  $('title').textContent = 'Tim ' + team.name;

  const SHOW = 5; // rows shown before "Lihat semua"
  let allSpgs = false, allSplit = false, split = 'stores';

  function shiftStatus(id, working) {
    const sh = D.getShift(id, D.TODAY);
    if (sh) return sh.end ? `<span class="pill">Selesai ${sh.end}</span>` : `<span class="pill ok">Aktif ${sh.start}</span>`;
    if (D.getReport(id, D.TODAY)) return '<span class="pill">Sudah lapor</span>';
    return working ? '<span class="pill bad">Belum mulai</span>' : '<span class="pill">Libur</span>';
  }
  const moreBtn = (el, n, open, label) => {
    el.hidden = n <= SHOW;
    el.textContent = open ? 'Tampilkan lebih sedikit' : `Lihat semua ${n} ${label}`;
  };

  function render() {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.p === period));
    const s = D.teamSummary(teamId, period, D.TODAY);
    const [from, to] = D.range(period, D.TODAY);
    const end = to < D.TODAY ? to : D.TODAY;
    $('sub').textContent = `${s.size} SPG · ${App.dateLong(D.TODAY)}`;

    $('hero').innerHTML = App.dashHero(s, period);
    App.animateRings();

    const [cf, ct] = D.chartRange(period, D.TODAY);
    App.trendChart($('trend'), D.dailySeries(s.lb.map(r => r.user.id), [teamId], cf, ct));

    // SPGs who have not started a shift today, with a WhatsApp reminder
    $('missingWrap').hidden = !s.missing.length;
    $('missingTitle').textContent = `Belum mulai shift (${s.missing.length})`;
    $('missing').innerHTML = s.missing.map(u => {
      const text = encodeURIComponent(`Halo ${u.name.split(' ')[0]}, jangan lupa mulai shift dan catat setiap penjualan hari ini ya. Terima kasih.`);
      const wa = u.phone ? `https://wa.me/62${u.phone.replace(/\D/g, '').replace(/^0/, '')}?text=${text}` : '';
      return `<div>
        <div class="grow">${App.person(u, D.storeLabel(u))}</div>
        ${wa ? `<a class="btn small ghost wa" href="${wa}" target="_blank" rel="noopener">${App.icon('message')}Ingatkan</a>` : ''}
      </div>`;
    }).join('');

    // Ranking: podium on wide screens, compact rows everywhere
    $('podium').innerHTML = App.podium(s.lb);
    $('spgs').innerHTML = s.lb.slice(0, allSpgs ? s.lb.length : SHOW).map(r => `
      <button type="button" class="rk" data-id="${r.user.id}">
        ${App.rankBadge(r.rank)}
        ${App.avatar(r.user)}
        <span class="grow">
          <span class="top"><b>${App.esc(r.user.name)}</b><b class="pct">${App.pct(r.pct)}</b></span>
          ${App.bar(r.pct)}
          <span class="meta"><span>${App.rpShort(r.actual)} / ${App.rpShort(r.target)}</span>${shiftStatus(r.user.id, s.working)}</span>
        </span>
      </button>`).join('') || '<p class="empty">Belum ada SPG.</p>';
    moreBtn($('spgsMore'), s.lb.length, allSpgs, 'SPG');

    // Sales per store or per product
    document.querySelectorAll('#splitTabs button').forEach(b => b.classList.toggle('on', b.dataset.k === split));
    let items;
    if (split === 'stores') {
      items = D.storeTotals(s.lb.map(r => r.user.id), from, end).map(x => ({
        img: `<span class="rk-ic">${App.icon('store')}</span>`, name: x.store.name, sub: `${x.tx} transaksi · ${x.spgs} SPG`, amount: x.amount,
      }));
    } else {
      items = s.products.map(p => ({ img: App.productImg(p.product), name: p.product.name, sub: `${App.num(p.qty)} terjual`, amount: p.amount }));
    }
    const max = Math.max(1, ...items.map(x => x.amount));
    $('split').innerHTML = items.slice(0, allSplit ? items.length : SHOW).map(x => `
      <div class="rk">
        ${x.img}
        <span class="grow">
          <span class="top"><b>${App.esc(x.name)}</b><b class="pct">${App.rpShort(x.amount)}</b></span>
          ${App.bar(x.amount / max * 100)}
          <span class="meta"><span>${App.esc(x.sub)}</span></span>
        </span>
      </div>`).join('') || '<p class="empty">Belum ada penjualan.</p>';
    moreBtn($('splitMore'), items.length, allSplit, split === 'stores' ? 'toko' : 'produk');

    $('exportSub').textContent = `Semua transaksi ${App.PERIOD_LABEL[period]} (${App.dateShort(from)} – ${App.dateShort(end)})`;
  }

  $('spgs').addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (b) location.href = App.page('laporan.html') + '?spg=' + encodeURIComponent(b.dataset.id);
  });
  $('spgsMore').addEventListener('click', () => { allSpgs = !allSpgs; render(); });
  $('splitMore').addEventListener('click', () => { allSplit = !allSplit; render(); });
  $('splitTabs').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) { split = b.dataset.k; allSplit = false; render(); } });

  $('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { period = b.dataset.p; render(); } });

  $('export').addEventListener('click', () => {
    const [from, to] = D.range(period, D.TODAY);
    const end = to < D.TODAY ? to : D.TODAY;
    const rows = [['Tanggal', 'Waktu', 'SPG', 'Toko', 'Produk', 'Qty', 'Harga', 'Subtotal']];
    D.listReports({ userIds: D.spgsOf(teamId, true).map(u => u.id), from, to: end }).reverse().forEach(r => {
      const u = D.user(r.userId);
      const storeName = id => (D.store(id) || {}).name || '';
      if (r.noSales) rows.push([r.date, '', u.name, storeName(D.storeFor(u.id, r.date, '')), 'Tidak ada penjualan', 0, 0, 0]);
      D.getTransactions(r).forEach(t => rows.push([r.date, t.time, u.name, storeName(t.storeId), D.product(t.productId).name, t.qty, t.price, t.qty * t.price]));
    });
    App.downloadCsv(`laporan-${team.name.toLowerCase().replace(/\s+/g, '-')}-${from}-sd-${end}.csv`, rows);
  });

  // Daily recap for a date range, as an Excel file (in a sheet)
  $('dxWrap').innerHTML = App.dailyExportHtml();
  App.dailyExport(() => teamId);
  const recapDlg = App.modal($('recapDlg'));
  $('openRecap').addEventListener('click', () => { recapDlg.open(); document.activeElement.blur(); });

  // Monthly Excel in the client's SOH / offtake layout (assets/js/soh-export.js)
  const months = [];
  for (let mk = D.monthKey(D.TODAY); mk >= D.monthKey(D.DATA_START); mk = D.addMonths(mk, -1)) months.push(mk);
  $('sohMonth').innerHTML = months.map(mk => `<option value="${mk}">${App.monthName(mk)}</option>`).join('');
  App.combobox($('sohMonth'));
  const sohDlg = App.modal($('sohDlg'));
  $('openSoh').addEventListener('click', () => { sohDlg.open(); document.activeElement.blur(); });
  $('sohForm').addEventListener('submit', async e => {
    e.preventDefault();
    const b = $('sohExport');
    b.disabled = true;
    try { await SohExport.download(teamId, $('sohMonth').value); sohDlg.close(); } catch (err) { App.toast('Export gagal. Periksa koneksi internet lalu coba lagi.'); }
    b.disabled = false;
  });

  render();
});
