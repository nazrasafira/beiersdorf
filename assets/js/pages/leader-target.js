Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['leader', 'supervisor'], teamPicker: true });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const teamId = App.teamId(user);
  const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  let mk = App.param('bulan') || D.monthKey(D.TODAY);
  if (!/^\d{4}-\d{2}$/.test(mk)) mk = D.monthKey(D.TODAY);

  const fmtInput = n => n ? App.num(n) : '';

  function render() {
    const spgs = D.spgsOf(teamId);
    const settings = D.getSettings(teamId);
    const wd = D.workingDaysInMonth(teamId, mk);
    const days = [1, 2, 3, 4, 5, 6, 0].filter(d => settings.workingDays.includes(d)).map(d => DAY_NAMES[d]).join(', ');
    $('month').textContent = App.monthName(mk);
    $('sub').textContent = `Tim ${D.team(teamId).name} · ${wd} hari kerja (${days})`;

    $('rows').innerHTML = spgs.map(u => {
      const t = D.targetRow(u.id, mk) || {};
      const setBy = t.setBy ? `${App.esc(D.user(t.setBy).name.split(' ')[0])}, ${App.dateMid(t.setAt)}` : '–';
      return `<tr data-id="${u.id}">
        <td><b>${App.esc(u.name)}</b><small>${App.esc(D.storeLabel(u))}</small></td>
        <td class="num"><input class="input t-input monthly" inputmode="numeric" value="${fmtInput(t.monthly)}" placeholder="0" aria-label="Target bulanan ${App.esc(u.name)}"></td>
        <td class="num"><input class="input t-input weekly ${t.weekly ? 'override' : ''}" inputmode="numeric" value="${fmtInput(t.weekly)}" aria-label="Target mingguan ${App.esc(u.name)}"></td>
        <td class="num"><input class="input t-input daily ${t.daily ? 'override' : ''}" inputmode="numeric" value="${fmtInput(t.daily)}" aria-label="Target harian ${App.esc(u.name)}"></td>
        <td class="small muted">${setBy}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" class="empty">Belum ada SPG aktif di tim ini.</td></tr>';
    $('rows').querySelectorAll('tr[data-id]').forEach(updatePlaceholders);
    App.tableTools($('rows').closest('table'), { placeholder: 'Cari SPG atau toko...' });
  }

  function updatePlaceholders(tr) {
    const p = D.targetPreview(teamId, mk, App.parseNum(tr.querySelector('.monthly').value));
    tr.querySelector('.weekly').placeholder = 'otomatis ' + App.num(Math.round(p.weekly / 1000) * 1000);
    tr.querySelector('.daily').placeholder = 'otomatis ' + App.num(Math.round(p.daily / 1000) * 1000);
  }

  $('rows').addEventListener('input', e => {
    const tr = e.target.closest('tr');
    if (e.target.classList.contains('monthly')) updatePlaceholders(tr);
    else e.target.classList.toggle('override', App.parseNum(e.target.value) > 0);
  });
  $('rows').addEventListener('focusout', e => {
    if (e.target.matches('.t-input')) e.target.value = fmtInput(App.parseNum(e.target.value));
  });

  $('prev').addEventListener('click', () => { mk = D.addMonths(mk, -1); render(); });
  $('next').addEventListener('click', () => { mk = D.addMonths(mk, 1); render(); });

  $('applyAll').addEventListener('click', () => {
    const inputs = [...document.querySelectorAll('#rows .monthly')];
    const first = inputs.find(i => App.parseNum(i.value));
    if (!first) { App.toast('Isi target bulanan di salah satu baris dulu.'); return; }
    inputs.forEach(i => { i.value = first.value; updatePlaceholders(i.closest('tr')); });
    App.toast('Target ' + first.value + ' diterapkan ke semua SPG. Klik Simpan.');
  });

  $('copyPrev').addEventListener('click', () => {
    const prev = D.addMonths(mk, -1);
    let n = 0;
    document.querySelectorAll('#rows tr[data-id]').forEach(tr => {
      const t = D.targetRow(tr.dataset.id, prev);
      if (!t) return;
      n++;
      tr.querySelector('.monthly').value = fmtInput(t.monthly);
      tr.querySelector('.weekly').value = fmtInput(t.weekly);
      tr.querySelector('.daily').value = fmtInput(t.daily);
      tr.querySelector('.weekly').classList.toggle('override', !!t.weekly);
      tr.querySelector('.daily').classList.toggle('override', !!t.daily);
      updatePlaceholders(tr);
    });
    App.toast(n ? `Target ${App.monthName(prev)} disalin. Klik Simpan.` : `Tidak ada target di ${App.monthName(prev)}.`);
  });

  $('save').addEventListener('click', () => {
    const rows = [...document.querySelectorAll('#rows tr[data-id]')].map(tr => ({
      userId: tr.dataset.id, mk,
      monthly: App.parseNum(tr.querySelector('.monthly').value),
      weekly: App.parseNum(tr.querySelector('.weekly').value),
      daily: App.parseNum(tr.querySelector('.daily').value),
    }));
    D.saveTargets(rows, user.id);
    App.toast('Target ' + App.monthName(mk) + ' disimpan.');
    render();
  });

  render();
});
