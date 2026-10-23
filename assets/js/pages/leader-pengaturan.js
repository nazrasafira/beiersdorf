Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['leader', 'manager'], teamPicker: true });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const teamId = App.teamId(user);
  const DAYS = [[1, 'Sen'], [2, 'Sel'], [3, 'Rab'], [4, 'Kam'], [5, 'Jum'], [6, 'Sab'], [0, 'Min']];
  let s = D.getSettings(teamId);

  $('sub').textContent = 'Tim ' + D.team(teamId).name;

  function renderDays() {
    $('days').innerHTML = DAYS.map(([d, n]) =>
      `<button type="button" class="chip ${s.workingDays.includes(d) ? 'on' : ''}" data-d="${d}" aria-pressed="${s.workingDays.includes(d)}">${n}</button>`).join('');
    $('dayCount').textContent = `${s.workingDays.length} hari kerja per minggu. Berlaku untuk SPG yang belum punya jadwal sendiri; jadwal per SPG (hari dan jam kerja) diatur di menu Tim.`;
  }

  // Holidays: one row each; "Libur" or "Toko buka" is a button that switches it. Changes are saved at once.
  function renderHolidays() {
    s.holidays.sort((a, b) => a.date.localeCompare(b.date));
    $('holidays').innerHTML = s.holidays.map((h, i) => `<div>
        <div class="grow"><b>${App.esc(h.name)}</b><span>${App.dateLong(h.date)}</span></div>
        <button type="button" class="btn ghost small" data-work="${i}" aria-label="${h.working ? 'Toko buka, ubah jadi libur' : 'Libur, ubah jadi toko buka'}">${h.working ? 'Toko buka' : 'Libur'}</button>
        ${App.iconBtn('trash', 'Hapus ' + h.name, `data-del="${i}"`, 'danger')}
      </div>`).join('') || '<p class="empty">Belum ada hari libur.</p>';
  }
  // Save only the holidays (the other fields keep their own Simpan)
  function saveHolidays(msg) {
    const saved = D.getSettings(teamId);
    saved.holidays = s.holidays.map(h => ({ ...h }));
    D.saveSettings(teamId, saved);
    App.toast(msg);
    renderHolidays();
  }

  $('days').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const d = +b.dataset.d;
    s.workingDays = s.workingDays.includes(d) ? s.workingDays.filter(x => x !== d) : [...s.workingDays, d];
    renderDays();
    markDirty();
  });

  // Working days, edit window and reminder are saved with Simpan: warn before leaving with unsaved changes
  let dirty = false;
  const markDirty = () => { dirty = true; $('save').textContent = 'Simpan perubahan'; };
  ['editDays', 'reminder'].forEach(id => $(id).addEventListener('input', markDirty));
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  $('holidays').addEventListener('click', async e => {
    const w = e.target.closest('[data-work]'), b = e.target.closest('[data-del]');
    if (w) {
      const h = s.holidays[+w.dataset.work];
      h.working = !h.working;
      saveHolidays(`${h.name}: ${h.working ? 'toko buka, SPG tetap kerja' : 'libur'}.`);
    } else if (b) {
      const h = s.holidays[+b.dataset.del];
      if (!await App.confirm(`${h.name} (${App.dateLong(h.date)}) dihapus dari daftar hari libur.`, { title: 'Hapus hari libur?', ok: 'Hapus', danger: true })) return;
      s.holidays.splice(+b.dataset.del, 1);
      saveHolidays('Hari libur dihapus.');
    }
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
    saveHolidays('Hari libur disimpan.');
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
    dirty = false;
    $('save').textContent = 'Simpan';
    const mk = D.monthKey(D.TODAY);
    App.toast(`Pengaturan disimpan. ${App.monthName(mk)}: ${D.workingDaysInMonth(teamId, mk)} hari kerja`);
  });

  renderDays();
  renderHolidays();
});
