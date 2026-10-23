Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['admin'] });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const ROLE = { leader: 'Team Leader', supervisor: 'Manager' };
  const PW = { leader: 'leader123', supervisor: 'super123' };

  function scopeOf(u) {
    if (u.role === 'leader') { const t = D.team(u.teamId); return t ? 'Tim ' + t.name : '-'; }
    const a = D.area(u.areaId); return a ? 'Area ' + a.name : '-';
  }

  /* ----- One card per Manager / Team Leader (phone first) ----- */
  function render() {
    const list = D.allUsers().filter(u => u.role === 'leader' || u.role === 'supervisor')
      .sort((a, b) => (b.active - a.active) || a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
    $('count').textContent = `${list.filter(u => u.active && u.role === 'supervisor').length} Manager · ${list.filter(u => u.active && u.role === 'leader').length} Team Leader aktif`;
    $('table').innerHTML = list.map(u => `
      <div class="spg-card ${u.active ? '' : 'off'}" data-text="${App.esc([u.name, u.phone, scopeOf(u), ROLE[u.role]].join(' ').toLowerCase())}">
        <div class="spg-top">
          ${App.person(u, `${ROLE[u.role]} · ${scopeOf(u)}`)}
          ${u.active ? '<span class="pill ok">Aktif</span>' : '<span class="pill">Nonaktif</span>'}
        </div>
        <p class="small muted" style="margin:8px 0 10px">${App.esc(App.phoneFmt(u.phone))}</p>
        <div class="spg-actions">
          <button type="button" class="btn ghost small" data-edit="${u.id}">${App.icon('pencil')}Ubah</button>
          <button type="button" class="btn ghost small" data-photo="${u.id}">${App.icon('camera')}Foto</button>
          <button type="button" class="btn ghost small" data-reset="${u.id}">${App.icon('key')}Reset password</button>
          <button type="button" class="btn ghost small ${u.active ? 'danger' : ''}" data-active="${u.id}">${App.icon(u.active ? 'userX' : 'userCheck')}${u.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
        </div>
      </div>`).join('') || '<p class="empty">Belum ada pengguna.</p>';
    filter();
  }
  function filter() {
    const q = $('q').value.trim().toLowerCase();
    let shown = 0;
    $('table').querySelectorAll('[data-text]').forEach(c => { c.hidden = !!q && !c.dataset.text.includes(q); shown += !c.hidden; });
    $('none').hidden = !q || shown > 0;
  }
  $('q').addEventListener('input', filter);

  $('table').addEventListener('click', async e => {
    const ed = e.target.closest('[data-edit]'), ph = e.target.closest('[data-photo]'), rs = e.target.closest('[data-reset]'), ac = e.target.closest('[data-active]');
    if (ed) {
      if (await App.editPerson(D.user(ed.dataset.edit), user.id)) { App.toast('Data pengguna disimpan.'); render(); }
    } else if (ph) {
      const photo = await App.pickImage('cover', 192);
      if (photo) { D.setUserPhoto(ph.dataset.photo, photo); App.toast('Foto diperbarui.'); render(); }
    } else if (rs) {
      const u = D.user(rs.dataset.reset);
      if (!await App.confirm(`Password ${u.name} kembali ke password awal dan harus diganti saat login.`, { title: 'Reset password?', ok: 'Reset' })) return;
      const pw = await D.resetPassword(u.id, user.id);
      App.toast(pw ? `Password ${u.name} direset ke: ${pw}` : 'Tidak bisa reset password.');
    } else if (ac) {
      const u = D.user(ac.dataset.active);
      if (u.active && !await App.confirm(`${u.name} tidak bisa login.`, { title: 'Nonaktifkan pengguna?', ok: 'Nonaktifkan', danger: true })) return;
      D.setActive(u.id, !u.active);
      App.toast(`${u.name} ${u.active ? 'diaktifkan' : 'dinonaktifkan'}.`);
      render();
    }
  });

  /* ----- Add dialog ----- */
  const form = $('form');
  const dlg = App.modal($('dlg'));
  function fillTeams() {
    $('f-team').innerHTML = D.teams().map(t => {
      const lead = D.user(t.leaderId);
      return `<option value="${t.id}">Tim ${App.esc(t.name)}${lead && lead.active ? ' (leader: ' + App.esc(lead.name) + ')' : ' (belum ada leader)'}</option>`;
    }).join('') + '<option value="__new">+ Tim baru</option>';
    $('f-area').innerHTML = D.areas().map(a => `<option value="${a.id}">Area ${App.esc(a.name)}</option>`).join('');
  }
  function syncRole() {
    const role = $('f-role').value;
    $('teamFields').hidden = role !== 'leader';
    $('areaField').hidden = role !== 'supervisor';
    $('newTeamField').hidden = !(role === 'leader' && $('f-team').value === '__new');
    $('pwNote').textContent = 'Password awal: ' + PW[role];
  }
  fillTeams();
  ['f-role', 'f-team', 'f-area'].forEach(id => App.combobox($(id)));
  $('f-role').addEventListener('change', syncRole);
  $('f-team').addEventListener('change', syncRole);

  $('openAdd').addEventListener('click', () => {
    form.reset(); fillTeams();
    ['f-role', 'f-team', 'f-area'].forEach(id => $(id)._combo.sync());
    $('err').hidden = true; syncRole(); dlg.open();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const role = $('f-role').value, team = $('f-team').value;
    // A team that already has an active leader: a second (co-)leader only after a confirmation
    const t = role === 'leader' && team !== '__new' ? D.team(team) : null, lead = t && D.user(t.leaderId);
    if (lead && lead.active && !await App.confirm(`Tim ${t.name} sudah punya Team Leader: ${lead.name}. ${form.name.value.trim() || 'Pengguna ini'} akan jadi leader kedua di tim itu.`, { title: 'Tim sudah punya leader', ok: 'Tetap tambah' })) return;
    const error = role === 'leader' && team === '__new' && !$('f-newteam').value.trim() ? 'Isi nama tim baru.' : await App.busy(form, () => D.addUser({
      role, name: form.name.value, phone: form.phone.value,
      teamId: team === '__new' ? null : team, newTeam: role === 'leader' && team === '__new' ? $('f-newteam').value.trim() : null,
      areaId: $('f-area').value,
    }, user.id));
    if (error) {
      $('err').textContent = error; $('err').hidden = false; return;
    }
    App.toast(`${form.name.value} ditambahkan sebagai ${ROLE[role]}. Login: ${App.phoneFmt(D.normalizePhone(form.phone.value))} / ${PW[role]}`);
    dlg.close();
    render();
    fillRecapTeams(); // a new team appears in the recap list at once
  });

  render();
  // Daily recap for a date range (one team or all), as an Excel file
  $('dxWrap').innerHTML = App.dailyExportHtml('<div class="field dx-team"><label for="dxTeam">Tim</label><select id="dxTeam"></select></div>');
  function fillRecapTeams() {
    const cur = $('dxTeam').value;
    $('dxTeam').innerHTML = '<option value="">Semua tim</option>' + D.teams().map(t => `<option value="${t.id}" ${t.id === cur ? 'selected' : ''}>Tim ${App.esc(t.name)}</option>`).join('');
    if ($('dxTeam')._combo) $('dxTeam')._combo.sync(); else App.combobox($('dxTeam'));
  }
  fillRecapTeams();
  App.dailyExport(() => $('dxTeam').value);
});
