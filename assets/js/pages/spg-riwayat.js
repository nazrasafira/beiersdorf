Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['spg'] });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const firstMonth = D.monthKey(D.DATA_START), lastMonth = D.monthKey(D.TODAY);
  let mk = App.param('bulan') || lastMonth;
  if (mk < firstMonth || mk > lastMonth) mk = lastMonth;

  function render() {
    $('month').textContent = App.monthName(mk);
    $('prev').disabled = mk <= firstMonth;
    $('next').disabled = mk >= lastMonth;

    const end = D.monthEnd(mk + '-01') < D.TODAY ? D.monthEnd(mk + '-01') : D.TODAY;
    let workDays = 0, sent = 0, total = 0;

    $('list').innerHTML = D.eachDay(mk + '-01', end).reverse().map(d => {
      const working = D.isWorkingDay(user.teamId, d);
      const r = D.getReport(user.id, d);
      if (working) workDays++;
      if (r) { sent++; total += r.total; }

      let status, value = '';
      if (r) {
        const t = D.dailyTarget(user.id, d);
        status = D.isLocked(user.id, d) ? `<span class="pill">${App.icon('lock')} Terkunci</span>` : `<span class="pill ok">${App.icon('check')} Terkirim</span>`;
        value = `<b>${App.rp(r.total)}</b>${t ? `<span>${App.pct(r.total / t * 100)} dari target</span>` : ''}`;
      } else if (!working) {
        status = '<span class="pill">Libur</span>';
      } else {
        status = d === D.TODAY ? '<span class="pill warn">Belum ada</span>' : '<span class="pill bad">Tidak lapor</span>';
      }
      const clickable = r || (working && !D.isLocked(user.id, d));
      const tag = clickable ? 'a' : 'div';
      return `<${tag} ${clickable ? `href="${App.page('laporan.html')}?tanggal=${d}"` : ''}>
        <div class="grow"><b>${App.dateShort(d)}</b><div class="status">${status}</div></div>
        <div class="val">${value}</div>
      </${tag}>`;
    }).join('');

    App.trendChart($('trend'), D.dailySeries([user.id], [user.teamId], mk + '-01', end));
    $('summary').textContent = `${sent} dari ${workDays} hari kerja dilaporkan · Total ${App.rp(total)}`;
  }

  $('prev').addEventListener('click', () => { mk = D.addMonths(mk, -1); render(); });
  $('next').addEventListener('click', () => { mk = D.addMonths(mk, 1); render(); });
  render();
});
