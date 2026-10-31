/* Terima kasih: shown after an SPG ends a shift, with a summary of the day. */
Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['spg'] });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);

  const shift = D.getShift(user.id, D.TODAY);
  if (!shift || !shift.end) { location.replace(App.page('beranda.html')); return; }

  const report = D.getReport(user.id, D.TODAY);
  const count = D.getTransactions(report).length;
  const store = D.store(shift.storeId);
  $('summary').innerHTML = [
    ['Shift', `${shift.start}–${shift.end}`],
    ['Toko', store ? store.name : '-'],
    ['Total penjualan', App.rp(report ? report.total : 0)],
    ['Transaksi', String(count)],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${App.esc(v)}</dd></div>`).join('');
  $('home').href = App.page('beranda.html');
  $('sales').href = App.page('laporan.html');

  // Colors, positions and timing differ per piece; the movement itself is in style.css
  const COLORS = ['#00136F', '#15803D', '#F59E0B', '#60A5FA', '#F472B6'];
  $('confetti').innerHTML = Array.from({ length: 28 }, (_, i) => {
    const left = Math.round(Math.random() * 100), delay = (0.35 + Math.random() * 0.5).toFixed(2), turn = Math.round(180 + Math.random() * 540);
    return `<i style="left:${left}%;background:${COLORS[i % COLORS.length]};animation-delay:${delay}s;--turn:${turn}deg"></i>`;
  }).join('');

  // Writes go through the phone's queue: only say it's sent once it really is
  function showSending() {
    const pending = D.pendingCount() > 0;
    $('sending').hidden = !pending;
    if (pending) $('sending').textContent = 'Data sedang dikirim. Kalau HP sedang offline, data terkirim otomatis saat online.';
    return pending;
  }
  if (showSending()) {
    const timer = setInterval(() => { if (!showSending()) clearInterval(timer); }, 1000);
  }

  $('thanks').hidden = false;
});
