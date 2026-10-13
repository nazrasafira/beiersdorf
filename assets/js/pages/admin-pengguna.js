Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['admin'] });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const ROLE = { leader: 'Team Leader', supervisor: 'Supervisor' };
  const PW = { leader: 'leader123', supervisor: 'super123' };

  function scopeOf(u) {
    if (u.role === 'leader') { const t = D.team(u.teamId); return t ? 'Tim ' + t.name : '-'; }
    const a = D.area(u.areaId); return a ? 'Area ' + a.name : '-';
  }

  function render() {
    const list = D.allUsers().filter(u => u.role === 'leader' || u.role === 'supervisor')
      .sort((a, b) => (b.active - a.active) || a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
    $('count').textContent = `${list.filter(u => u.active && u.role === 'supervisor').length} Supervisor · ${list.filter(u => u.active && u.role === 'leader').length} Team Leader aktif`;
    $('table').innerHTML = `
      <thead><tr><th>Nama</th><th>Peran</th><th>Tim / Area</th><th>No. HP</th><th>Status</th><th></th></tr></thead>
      <tbody>${list.map(u => `<tr>
        <td>${App.person(u)}</td>
        <td><span class="pill ${u.role === 'supervisor' ? 'info' : ''}">${ROLE[u.role]}</span></td>
        <td>${App.esc(scopeOf(u))}</td>
        <td>${App.esc(App.phoneFmt(u.phone))}</td>
        <td>${u.active ? '<span class="pill ok">Aktif</span>' : '<span class="pill">Nonaktif</span>'}</td>
        <td class="num"><span class="icon-group">
          ${App.iconBtn('camera', 'Ganti foto ' + u.name, `data-photo="${u.id}"`)}
          ${App.iconBtn('key', 'Reset password ' + u.name, `data-reset="${u.id}"`)}
          ${App.iconBtn(u.active ? 'userX' : 'userCheck', u.active ? 'Nonaktifkan' : 'Aktifkan', `data-active="${u.id}"`, u.active ? 'danger' : 'primary')}
        </span></td>
      </tr>`).join('')}</tbody>`;
    App.tableTools($('table'), { placeholder: 'Cari nama, nomor HP, tim...' });
  }

  $('table').addEventListener('click', async e => {
    const ph = e.target.closest('[data-photo]'), rs = e.target.closest('[data-reset]'), ac = e.target.closest('[data-active]');
    if (ph) {
      const photo = await App.pickImage('cover', 192);
      if (photo) { D.setUserPhoto(ph.dataset.photo, photo); App.toast('Foto diperbarui.'); render(); }
    } else if (rs) {
      const u = D.user(rs.dataset.reset);
      if (!confirm(`Reset password ${u.name}?`)) return;
      const pw = await D.resetPassword(u.id, user.id);
      App.toast(pw ? `Password ${u.name} direset ke: ${pw}` : 'Tidak bisa reset password.');
    } else if (ac) {
      const u = D.user(ac.dataset.active);
      if (u.active && !confirm(`Nonaktifkan ${u.name}? Pengguna ini tidak bisa login.`)) return;
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
  });

  render();
});
