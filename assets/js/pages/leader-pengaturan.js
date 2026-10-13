Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['leader', 'supervisor'], teamPicker: true });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const teamId = App.teamId(user);
  const DAYS = [[1, 'Sen'], [2, 'Sel'], [3, 'Rab'], [4, 'Kam'], [5, 'Jum'], [6, 'Sab'], [0, 'Min']];
  let s = D.getSettings(teamId);

  $('sub').textContent = 'Tim ' + D.team(teamId).name;

  function renderDays() {
    $('days').innerHTML = DAYS.map(([d, n]) =>
      `<button type="button" class="chip ${s.workingDays.includes(d) ? 'on' : ''}" data-d="${d}" aria-pressed="${s.workingDays.includes(d)}">${n}</button>`).join('');
    $('dayCount').textContent = `${s.workingDays.length} hari kerja per minggu.`;
  }

  function renderHolidays() {
    s.holidays.sort((a, b) => a.date.localeCompare(b.date));
    $('holidays').innerHTML = s.holidays.length ? `
      <thead><tr><th>Tanggal</th><th>Keterangan</th><th>Tetap hari kerja?</th><th></th></tr></thead>
      <tbody>${s.holidays.map((h, i) => `<tr>
        <td>${App.dateMid(h.date)}</td>
        <td>${App.esc(h.name)}</td>
        <td><label class="check"><input type="checkbox" data-work="${i}" ${h.working ? 'checked' : ''}> ${h.working ? 'Ya' : 'Tidak'}</label></td>
        <td class="num">${App.iconBtn('trash', 'Hapus hari libur', `data-del="${i}"`, 'danger')}</td>
      </tr>`).join('')}</tbody>`
      : '<tbody><tr><td class="empty">Belum ada hari libur.</td></tr></tbody>';
    App.tableTools($('holidays'), { placeholder: 'Cari hari libur...' });
  }

  $('days').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const d = +b.dataset.d;
    s.workingDays = s.workingDays.includes(d) ? s.workingDays.filter(x => x !== d) : [...s.workingDays, d];
    renderDays();
  });

  $('holidays').addEventListener('change', e => {
    const i = e.target.dataset.work;
    if (i != null) { s.holidays[i].working = e.target.checked; renderHolidays(); }
  });
  $('holidays').addEventListener('click', e => {
    const b = e.target.closest('[data-del]');
    if (b) { s.holidays.splice(+b.dataset.del, 1); renderHolidays(); }
  });

  const dlg = App.modal($('dlg'));
  $('openAdd').addEventListener('click', () => { $('hForm').reset(); dlg.open(); });
  $('hForm').addEventListener('submit', e => {
    e.preventDefault();
    const date = $('hDate').value, name = $('hName').value.trim();
    if (!date || !name) { App.toast('Isi tanggal dan keterangan hari libur.'); return; }
    if (s.holidays.some(h => h.date === date)) { App.toast('Tanggal itu sudah ada di daftar.'); return; }
    s.holidays.push({ date, name, working: $('hWork').checked });
    dlg.close();
    App.toast('Hari libur ditambahkan. Klik Simpan untuk menyimpan pengaturan.');
    renderHolidays();
  });

  $('editDays').value = s.editDays;
  $('reminder').value = s.reminder;

  $('save').addEventListener('click', () => {
    if (!s.workingDays.length) { App.toast('Pilih minimal 1 hari kerja.'); return; }
    const ed = Math.floor(+$('editDays').value);
    if (!(ed >= 0 && ed <= 14)) { App.toast('Batas ubah laporan harus 0–14 hari.'); return; }
    s.editDays = ed;
    s.reminder = $('reminder').value || '20:00';
    D.saveSettings(teamId, s);
    s = D.getSettings(teamId);
    const mk = D.monthKey(D.TODAY);
    App.toast(`Pengaturan disimpan. ${App.monthName(mk)}: ${D.workingDaysInMonth(teamId, mk)} hari kerja`);
  });

  renderDays();
  renderHolidays();
});
