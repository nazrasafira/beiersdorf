Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['leader', 'supervisor'], teamPicker: true });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const teamId = App.teamId(user);

  $('sub').textContent = 'Tim ' + D.team(teamId).name;

  function render() {
    const list = D.spgsOf(teamId, true).sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
    $('count').textContent = `${list.filter(u => u.active).length} aktif`;
    $('table').innerHTML = `
      <thead><tr><th>Nama</th><th>No. HP</th><th>Toko terakhir</th><th>Status</th><th></th></tr></thead>
      <tbody>${list.map(u => `<tr>
        <td>${App.person(u)}</td>
        <td>${App.esc(App.phoneFmt(u.phone))}</td>
        <td>${App.esc(D.storeLabel(u) || '-')}</td>
        <td>${u.active ? '<span class="pill ok">Aktif</span>' : '<span class="pill">Nonaktif</span>'}</td>
        <td class="num"><span class="icon-group">${App.iconBtn('camera', 'Ganti foto ' + u.name, `data-photo="${u.id}"`)}${App.iconBtn('key', 'Reset password ' + u.name, `data-reset="${u.id}"`)}${App.iconBtn(u.active ? 'userX' : 'userCheck', u.active ? 'Nonaktifkan SPG' : 'Aktifkan SPG', `data-id="${u.id}"`, u.active ? 'danger' : 'primary')}</span></td>
      </tr>`).join('')}</tbody>`;
    App.tableTools($('table'), { placeholder: 'Cari nama, nomor HP, toko...' });
  }

  $('table').addEventListener('click', async e => {
    const ph = e.target.closest('button[data-photo]');
    if (ph) {
      const photo = await App.pickImage('cover', 192);
      if (photo) { D.setUserPhoto(ph.dataset.photo, photo); App.toast('Foto diperbarui.'); render(); }
      return;
    }
    const rs = e.target.closest('button[data-reset]');
    if (rs) {
      const t = D.user(rs.dataset.reset);
      if (!confirm(`Reset password ${t.name}?`)) return;
      const pw = await D.resetPassword(t.id, user.id);
      App.toast(pw ? `Password ${t.name} direset ke: ${pw}` : 'Tidak bisa reset password.');
      return;
    }
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    const u = D.user(b.dataset.id);
    if (u.active && !confirm(`Nonaktifkan ${u.name}? SPG ini tidak bisa login dan tidak masuk peringkat.`)) return;
    D.setActive(u.id, !u.active);
    App.toast(`${u.name} ${u.active ? 'diaktifkan' : 'dinonaktifkan'}`);
    render();
  });

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
