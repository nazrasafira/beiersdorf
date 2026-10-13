Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['leader', 'supervisor'], teamPicker: true });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const teamId = App.teamId(user);
  const team = D.team(teamId);
  let period = 'month';

  $('title').textContent = 'Tim ' + team.name;

  function shiftStatus(id, working) {
    const sh = D.getShift(id, D.TODAY);
    if (sh) return sh.end ? `<span class="pill">Selesai ${sh.end}</span>` : `<span class="pill ok">Aktif sejak ${sh.start}</span>`;
    if (D.getReport(id, D.TODAY)) return '<span class="pill">Sudah lapor</span>';
    return working ? '<span class="pill bad">Belum mulai</span>' : '<span class="pill">Libur</span>';
  }

  function render() {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.p === period));
    const s = D.teamSummary(teamId, period, D.TODAY);
    $('sub').textContent = `${s.size} SPG · ${App.dateLong(D.TODAY)}`;

    let pace = '';
    if (s.expected != null) {
      const diff = s.pct - s.expected;
      pace = diff >= 0 ? `<span class="ok">${App.pct1(diff)} di atas laju</span>` : `<span class="warn">${App.pct1(-diff)} di bawah laju</span>`;
    }
    $('stats').innerHTML = `
      <div class="stat"><span class="badge">${App.icon('chart')}</span><div><div class="l">Penjualan</div><div class="v">${App.rpShort(s.actual)}</div><div class="s">dari ${App.rpShort(s.target)}</div></div></div>
      <div class="stat"><span class="badge ${s.pct >= (s.expected || 0) ? 'green' : 'amber'}">${App.icon('target')}</span><div><div class="l">Pencapaian</div><div class="v">${App.pct1(s.pct)}</div><div class="s">${pace}</div></div></div>
      <div class="stat"><span class="badge">${App.icon('userCheck')}</span><div><div class="l">Mulai shift hari ini</div><div class="v">${s.working ? `${s.reported}/${s.size}` : '-'}</div><div class="s">${s.working ? '' : 'Hari libur'}</div></div></div>`;

    const [cf, ct] = D.chartRange(period, D.TODAY);
    App.trendChart($('trend'), D.dailySeries(s.lb.map(r => r.user.id), [teamId], cf, ct));

    $('missingWrap').hidden = !s.missing.length;
    $('missing').innerHTML = s.missing.map(u => {
      const text = encodeURIComponent(`Halo ${u.name.split(' ')[0]}, jangan lupa mulai shift dan catat setiap penjualan hari ini ya. Terima kasih.`);
      const wa = u.phone ? `https://wa.me/62${u.phone.replace(/\D/g, '').replace(/^0/, '')}?text=${text}` : '';
      return `<div>
        <div class="grow">${App.person(u, D.storeLabel(u))}</div>
        ${wa ? App.iconLink(wa, 'message', 'Ingatkan via WhatsApp', 'target="_blank" rel="noopener"', 'primary') : ''}
      </div>`;
    }).join('');

    $('podium').innerHTML = App.podium(s.lb);
    $('spgs').innerHTML = s.lb.map(r => `
      <div class="rank-row click" data-id="${r.user.id}">
        ${App.rankBadge(r.rank)}
        <div>
          ${App.person(r.user, `${App.rpShort(r.actual)} dari ${App.rpShort(r.target)}`)}
          ${App.bar(r.pct)}
        </div>
        <div class="right"><b>${App.pct(r.pct)}</b>${shiftStatus(r.user.id, s.working)}</div>
      </div>`).join('');
    $('spgs').querySelectorAll('.rank-row').forEach(el => el.addEventListener('click', () => {
      location.href = App.page('laporan.html') + '?spg=' + encodeURIComponent(el.dataset.id);
    }));

    const [sf, stt] = D.range(period, D.TODAY);
    const st = D.storeTotals(s.lb.map(r => r.user.id), sf, stt < D.TODAY ? stt : D.TODAY);
    const maxStore = Math.max(1, ...st.map(x => x.amount));
    $('stores').innerHTML = st.map(x => `
      <div>
        <div class="grow"><b>${App.esc(x.store.name)}</b><span>${App.esc(x.store.city)} · ${x.tx} transaksi · ${x.spgs} SPG</span>${App.bar(x.amount / maxStore * 100)}</div>
        <div class="val"><b>${App.rpShort(x.amount)}</b></div>
      </div>`).join('') || '<p class="empty">Belum ada penjualan.</p>';

    const maxAmount = Math.max(1, ...s.products.map(p => p.amount));
    $('products').innerHTML = s.products.map(p => `
      <div class="pcard">
        ${App.productImg(p.product, 'lg')}
        <div>
          <b>${App.esc(p.product.name)}</b>
          <div class="small">${App.num(p.qty)} terjual · ${App.rpShort(p.amount)}</div>
          ${App.bar(p.amount / maxAmount * 100)}
        </div>
      </div>`).join('') || '<p class="empty">Belum ada penjualan.</p>';
  }

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

  render();
});
