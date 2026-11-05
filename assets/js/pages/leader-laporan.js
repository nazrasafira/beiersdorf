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

  const storeName = id => (D.store(id) || {}).name || '';
  function shiftLine(r) {
    const sh = D.getShift(r.userId, r.date);
    if (!sh) return '';
    const photos = sh.photos || [];
    return `<p class="small muted" style="margin:0 0 8px">Shift ${sh.start}–${sh.end || 'sekarang'}${photos.length ? ` · Foto catatan (${photos.length})` : ''}</p>`
      + (photos.length ? App.notePhotos(photos) : '');
  }

  const PAGE = 20; // days or SPGs per page
  let page = 1, view = pre ? 'spg' : 'day';
  const opened = new Set(pre ? ['spg|' + pre] : []); // days, SPGs and reports that stay open when the list is redrawn

  /* One report = one SPG on one day, with that day's transactions. With a store filter it only counts the sales at that store. */
  function collect() {
    const picked = $('spg').value ? spgs.filter(u => u.id === $('spg').value) : spgs;
    let from = $('from').value || D.DATA_START, to = $('to').value || D.TODAY;
    if (from > to) { [from, to] = [to, from]; $('from').value = from; $('to').value = to; } // keep the fields in order too
    const storeId = $('store').value;
    const reports = D.listReports({ userIds: picked.map(u => u.id), from, to }).map(r => {
      const tx = D.getTransactions(r).filter(t => !storeId || t.storeId === storeId);
      return { r, tx, user: D.user(r.userId), amount: storeId ? tx.reduce((a, t) => a + t.qty * t.price, 0) : r.total, stores: [...new Set(D.getTransactions(r).map(t => t.storeId))] };
    }).filter(x => !storeId || x.stores.includes(storeId));
    const byKey = new Map(reports.map(x => [x.r.userId + '|' + x.r.date, x]));
    // Working days without a report, up to today. A store filter can't tell who should have been there.
    const days = D.eachDay(from < D.DATA_START ? D.DATA_START : from, to);
    const missed = u => (storeId ? [] : days.filter(d => (!u.since || d >= u.since) && u.active && D.isWorkingDayFor(u.id, d) && !byKey.has(u.id + '|' + d)));
    return { picked, from, to, storeId, reports, days, missed };
  }

  const reportItem = (x, title) => {
    const { r, tx } = x, key = 'rep|' + r.userId + '|' + r.date, open = opened.has(key);
    const stores = x.stores.map(storeName).filter(Boolean).join(', ') || storeName(D.storeFor(r.userId, r.date, ''));
    const hasPhoto = ((D.getShift(r.userId, r.date) || {}).photos || []).length > 0;
    return `<div class="sd-item">
      <button type="button" class="sd-row" data-open="${App.esc(key)}" aria-expanded="${open}">
        <span class="grow"><b>${App.esc(title)}</b><small>${App.esc([stores, r.noSales ? 'Tidak ada penjualan' : tx.length + ' transaksi', hasPhoto ? 'ada foto catatan' : ''].filter(Boolean).join(' · '))}</small></span>
        <span class="sd-amount">${App.rp(x.amount)}</span>${App.icon('chevDown')}
      </button>
      <div class="rep-detail" ${open ? '' : 'hidden'}>
        ${shiftLine(r)}
        ${r.noSales ? '<p class="muted small">Tidak ada penjualan.</p>' : `<div class="rows">${tx.map(t => `<div>
          ${App.productImg(D.product(t.productId))}
          <div class="grow"><b>${App.esc(D.product(t.productId).name)}</b><span>${[t.time, App.esc(storeName(t.storeId))].filter(Boolean).join(' · ')} · ${t.qty} × ${App.num(t.price)}</span></div>
          <div class="val">${App.num(t.qty * t.price)}</div>
        </div>`).join('')}</div>`}
        <a class="btn ghost small" style="margin-top:8px" href="${App.page('../spg/laporan.html')}?spg=${encodeURIComponent(r.userId)}&tanggal=${r.date}">${App.icon('pencil')}Ubah laporan</a>
      </div>
    </div>`;
  };
  const group = (key, title, sub, amount, body, lead) => {
    const open = opened.has(key);
    return `<div class="sd-group" data-group="${App.esc(key)}">
      <button type="button" class="sd-head" data-open="${App.esc(key)}" aria-expanded="${open}">
        ${lead || ''}<span class="grow"><b>${App.esc(title)}</b><small>${sub}</small></span>
        <span class="sd-amount">${App.rp(amount)}</span>${App.icon('chevDown')}
      </button>
      <div class="sd-body" ${open ? '' : 'hidden'}>${body}</div>
    </div>`;
  };
  const sumOf = (list, f) => list.reduce((a, x) => a + f(x), 0);

  function dayGroups(c) {
    const out = [];
    c.days.slice().reverse().forEach(d => {
      const list = c.reports.filter(x => x.r.date === d).sort((a, b) => b.amount - a.amount);
      const missing = c.picked.filter(u => c.missed(u).includes(d));
      if (!list.length && !missing.length) return; // a day off for everyone
      const expected = list.length + missing.length;
      const sub = [
        c.storeId ? `${list.length} SPG lapor` : `${list.length} dari ${expected} SPG lapor`,
        sumOf(list, x => x.tx.length) + ' transaksi',
        missing.length ? `<span class="num-warn">${missing.length} belum lapor</span>` : '',
      ].filter(Boolean).join(' · ');
      out.push({ d, html: group('day|' + d, App.dateLong(d), sub, sumOf(list, x => x.amount),
        list.map(x => reportItem(x, x.user.name)).join('') + (missing.length ? `<p class="sd-missing">Belum lapor: ${App.esc(missing.map(u => u.name).join(', '))}</p>` : '')) });
    });
    return out;
  }
  function spgGroups(c) {
    return c.picked.map(u => ({ u, list: c.reports.filter(x => x.r.userId === u.id), missing: c.missed(u) }))
      .filter(g => g.list.length || g.missing.length)
      .map(g => Object.assign(g, { total: sumOf(g.list, x => x.amount) }))
      .sort((a, b) => b.total - a.total || a.u.name.localeCompare(b.u.name))
      .map(({ u, list, missing, total }) => {
        const expected = list.length + missing.length;
        const sub = [
          c.storeId ? `${list.length} hari lapor` : `${list.length} dari ${expected} hari lapor`,
          sumOf(list, x => x.tx.length) + ' transaksi',
          list.length ? `rata-rata ${App.rp(Math.round(total / list.length))}/hari` : '',
        ].filter(Boolean).join(' · ');
        const days = list.slice().sort((a, b) => (a.r.date < b.r.date ? 1 : -1));
        return { html: group('spg|' + u.id, u.name, sub, total,
          days.map(x => reportItem(x, App.dateLong(x.r.date))).join('') + (missing.length ? `<p class="sd-missing">Belum lapor: ${App.esc(missing.map(App.dateShort).join(', '))}</p>` : ''), App.avatar(u)) };
      });
  }

  function render() {
    const c = collect();
    App.trendChart($('trend'), D.dailySeries(c.picked.map(u => u.id), [teamId], c.from, c.to, c.storeId || null), openDay);
    const total = sumOf(c.reports, x => x.amount);
    const reportedDays = new Set(c.reports.map(x => x.r.date)).size;
    const reportedSpgs = new Set(c.reports.map(x => x.r.userId)).size;
    $('salesStats').innerHTML = [
      ['Total penjualan', App.rp(total), `${c.reports.length} laporan harian`],
      ['Transaksi', App.num(sumOf(c.reports, x => x.tx.length)), `${reportedDays} hari`],
      ['SPG lapor', `${reportedSpgs} dari ${c.picked.length}`, 'di rentang ini'],
      ['Rata-rata per hari', App.rp(reportedDays ? Math.round(total / reportedDays) : 0), 'seluruh SPG'],
    ].map(([k, v, s]) => `<div><span>${k}</span><b>${v}</b><small>${App.esc(s)}</small></div>`).join('');

    $('salesView').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === view));
    const groups = view === 'day' ? dayGroups(c) : spgGroups(c);
    if (!groups.length) { $('table').innerHTML = '<p class="empty">Tidak ada laporan pada filter ini.</p>'; $('pager').hidden = true; return; }
    const label = view === 'day' ? 'hari' : 'SPG';
    const [pf, pt, at] = App.pager($('pager'), { page, size: PAGE, total: groups.length, label, onPage: n => { page = n; render(); $('salesView').scrollIntoView({ block: 'start', behavior: 'smooth' }); } });
    page = at;
    $('table').innerHTML = groups.slice(pf, pt).map(g => g.html).join('');
  }
  // A bar of the chart opens that day in the list
  function openDay(date) {
    view = 'day';
    const c = collect(), i = dayGroups(c).findIndex(g => g.d === date);
    if (i < 0) { App.toast('Tidak ada laporan di tanggal ini.'); return; }
    page = Math.floor(i / PAGE) + 1;
    opened.add('day|' + date);
    render();
    const el = $('table').querySelector(`[data-group="day|${date}"]`);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  $('table').addEventListener('click', e => {
    const b = e.target.closest('[data-open]');
    if (!b) return;
    const key = b.dataset.open, body = b.nextElementSibling, show = body.hidden;
    body.hidden = !show;
    b.setAttribute('aria-expanded', show);
    if (show) opened.add(key); else opened.delete(key);
  });
  $('salesView').addEventListener('click', e => {
    const b = e.target.closest('button[data-k]');
    if (b && b.dataset.k !== view) { view = b.dataset.k; page = 1; render(); }
  });
  $('salesPresets').addEventListener('click', e => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    $('from').value = b.dataset.p === 'today' ? D.TODAY : b.dataset.p === 'week' ? D.weekStart(D.TODAY) : D.monthStart(D.TODAY);
    $('to').value = D.TODAY;
    page = 1;
    render();
  });
  ['spg', 'store', 'from', 'to'].forEach(id => $(id).addEventListener('change', () => { page = 1; render(); }));

  /* ----- Tabs: Penjualan, Sell In & Sell Out, Pencapaian ----- */
  const aktual = window.AktualTab(teamId, D.team(teamId).name);
  const pencapaian = window.PencapaianTab(teamId, D.team(teamId).name);
  let tab = 'sales';
  function showTab(k) {
    tab = k;
    $('mainTabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    document.querySelectorAll('[data-pane=sales]').forEach(el => { el.hidden = k !== 'sales'; });
    $('actualPane').hidden = k !== 'aktual';
    $('pencapaianPane').hidden = k !== 'pencapaian';
    if (k === 'aktual') aktual.open();
    else if (k === 'pencapaian') pencapaian.open();
    else render(); // the chart needs a visible page to measure
    const q = new URLSearchParams(location.search);
    if (k !== 'sales') q.set('tab', k); else q.delete('tab');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
  }
  $('mainTabs').addEventListener('click', async e => {
    const b = e.target.closest('button[data-k]');
    if (!b || b.dataset.k === tab || (tab === 'aktual' && !await aktual.leave())) return;
    showTab(b.dataset.k);
  });
  showTab(['aktual', 'pencapaian'].includes(App.param('tab')) ? App.param('tab') : 'sales');
});
