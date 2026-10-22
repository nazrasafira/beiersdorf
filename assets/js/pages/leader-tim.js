Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['leader', 'supervisor'], teamPicker: true });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const teamId = App.teamId(user);
  const WEEK = [[1, 'Sen'], [2, 'Sel'], [3, 'Rab'], [4, 'Kam'], [5, 'Jum'], [6, 'Sab'], [0, 'Min']];

  $('sub').textContent = 'Tim ' + D.team(teamId).name;

  /* ----- One card per SPG: photo, phone, last store, schedule, actions ----- */
  function render() {
    const list = D.spgsOf(teamId, true).sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
    $('count').textContent = `${list.filter(u => u.active).length} aktif`;
    $('list').innerHTML = list.map(u => `
      <div class="spg-card ${u.active ? '' : 'off'}" data-text="${App.esc([u.name, u.phone, D.storeLabel(u)].join(' ').toLowerCase())}">
        <div class="spg-top">
          ${App.person(u, App.phoneFmt(u.phone) + (D.storeLabel(u) ? ' · ' + D.storeLabel(u) : ''))}
          ${u.active ? '<span class="pill ok">Aktif</span>' : '<span class="pill">Nonaktif</span>'}
        </div>
        <button type="button" class="spg-sch" data-sch="${u.id}">
          ${App.icon('clock')}
          <span class="grow"><b>${App.esc(D.scheduleLabel(u.id).split(' · ')[0])}</b><small>${[u.workStart && u.workEnd ? u.workStart + '–' + u.workEnd : '', D.hasOwnSchedule(u.id) ? 'Jadwal sendiri' : 'Ikut hari kerja tim'].filter(Boolean).join(' · ')}</small></span>
          <span class="btn ghost small">Atur jadwal</span>
        </button>
        <div class="spg-actions">
          <button type="button" class="btn ghost small" data-photo="${u.id}">${App.icon('camera')}Foto</button>
          <button type="button" class="btn ghost small" data-reset="${u.id}">${App.icon('key')}Reset password</button>
          <button type="button" class="btn ghost small ${u.active ? 'danger' : ''}" data-id="${u.id}">${App.icon(u.active ? 'userX' : 'userCheck')}${u.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
        </div>
      </div>`).join('') || '<p class="empty">Belum ada SPG di tim ini.</p>';
    filter();
  }

  function filter() {
    const q = $('q').value.trim().toLowerCase();
    let shown = 0;
    $('list').querySelectorAll('[data-text]').forEach(c => { c.hidden = !!q && !c.dataset.text.includes(q); shown += !c.hidden; });
    $('none').hidden = !q || shown > 0;
  }
  $('q').addEventListener('input', filter);

  $('list').addEventListener('click', async e => {
    const sch = e.target.closest('[data-sch]');
    if (sch) { openSchedule(sch.dataset.sch); return; }
    const ph = e.target.closest('button[data-photo]');
    if (ph) {
      const photo = await App.pickImage('cover', 192);
      if (photo) { D.setUserPhoto(ph.dataset.photo, photo); App.toast('Foto diperbarui.'); render(); }
      return;
    }
    const rs = e.target.closest('button[data-reset]');
    if (rs) {
      const t = D.user(rs.dataset.reset);
      if (!await App.confirm(`Password ${t.name} kembali ke password awal dan harus diganti saat login.`, { title: 'Reset password?', ok: 'Reset' })) return;
      const pw = await D.resetPassword(t.id, user.id);
      App.toast(pw ? `Password ${t.name} direset ke: ${pw}` : 'Tidak bisa reset password.');
      return;
    }
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    const u = D.user(b.dataset.id);
    if (u.active && !await App.confirm(`${u.name} tidak bisa login dan tidak masuk peringkat.`, { title: 'Nonaktifkan SPG?', ok: 'Nonaktifkan', danger: true })) return;
    D.setActive(u.id, !u.active);
    App.toast(`${u.name} ${u.active ? 'diaktifkan' : 'dinonaktifkan'}`);
    render();
  });

  /* ----- Schedule sheet: working days of the week and hours for one SPG ----- */
  const schDlg = App.modal($('schDlg'));
  let schUser = null, schDays = [];
  function drawDays() {
    $('schDays').innerHTML = WEEK.map(([d, n]) =>
      `<button type="button" class="day-pick ${schDays.includes(d) ? 'on' : ''}" data-d="${d}" aria-pressed="${schDays.includes(d)}">${n}</button>`).join('');
    $('schNote').textContent = `${schDays.length} hari kerja per minggu. Target harian dihitung dari hari kerja ini; hari libur tim tetap berlaku.`;
  }
  function openSchedule(userId) {
    const u = D.user(userId), team = D.getSettings(u.teamId);
    schUser = u;
    schDays = (u.workDays && u.workDays.length ? u.workDays : team.workingDays).slice();
    $('schTitle').textContent = 'Jadwal ' + u.name.split(' ')[0];
    $('schStart').value = u.workStart || '';
    $('schEnd').value = u.workEnd || '';
    $('schTeam').hidden = !D.hasOwnSchedule(u.id);
    drawDays();
    schDlg.open();
    document.activeElement.blur();
  }
  $('schDays').addEventListener('click', e => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    const d = +b.dataset.d;
    schDays = schDays.includes(d) ? schDays.filter(x => x !== d) : [...schDays, d];
    drawDays();
  });
  $('schForm').addEventListener('submit', e => {
    e.preventDefault();
    const start = $('schStart').value, end = $('schEnd').value;
    if (!schDays.length) { App.toast('Pilih minimal 1 hari kerja.'); return; }
    if ((start || end) && !(start && end)) { App.toast('Isi jam mulai dan jam selesai.'); return; }
    if (start && start >= end) { App.toast('Jam selesai harus setelah jam mulai.'); return; }
    D.setSchedule(schUser.id, { days: schDays.slice().sort(), start, end });
    schDlg.close();
    App.toast(`Jadwal ${schUser.name.split(' ')[0]}: ${D.scheduleLabel(schUser.id)}`);
    render();
  });
  $('schTeam').addEventListener('click', () => {
    D.setSchedule(schUser.id, { useTeam: true });
    schDlg.close();
    App.toast(`${schUser.name.split(' ')[0]} ikut hari kerja tim lagi.`);
    render();
  });

  /* ----- Add SPG ----- */
  const dlg = App.modal($('dlg'));
  $('openAdd').addEventListener('click', () => { $('form').reset(); $('err').hidden = true; dlg.open(); });

  $('form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const error = await App.busy(f, () => D.addSpg({ name: f.name.value, phone: f.phone.value, teamId }, user.id));
    if (error) { $('err').textContent = error; $('err').hidden = false; return; }
    $('err').hidden = true;
    App.toast(`${f.name.value} ditambahkan. Login: ${App.phoneFmt(D.normalizePhone(f.phone.value))} / spg123`);
    f.reset();
    dlg.close();
    render();
  });

  render();
});
