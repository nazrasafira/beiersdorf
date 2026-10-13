Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['admin', 'supervisor', 'leader'] });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const form = $('form');
  const byName = id => { const u = D.user(id); return u ? u.name : '-'; };
  $('openAdd').hidden = !D.canAddCatalog(user);

  function render() {
    const list = D.stores(true).slice().sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
    $('count').textContent = `${list.filter(s => s.active).length} toko aktif dari ${list.length}`;
    $('table').innerHTML = `
      <thead><tr><th>Toko</th><th>Kota</th><th>Alamat</th><th>Status</th><th>Ditambahkan oleh</th><th></th></tr></thead>
      <tbody>${list.map(s => `<tr>
        <td><b>${App.esc(s.name)}</b><small>${App.esc(s.chain || '')}</small></td>
        <td>${App.esc(s.city)}</td>
        <td><small>${App.esc(s.address || '')}</small></td>
        <td>${s.active ? '<span class="pill ok">Aktif</span>' : '<span class="pill">Nonaktif</span>'}</td>
        <td><small>${App.esc(byName(s.createdBy))}</small>${s.updatedBy && s.updatedBy !== s.createdBy ? `<small class="muted">diubah ${App.esc(byName(s.updatedBy))}</small>` : ''}</td>
        <td class="num">${D.canEditCatalog(user, s) ? App.iconBtn('pencil', 'Ubah toko', `data-id="${s.id}"`) : ''}</td>
      </tr>`).join('')}</tbody>`;
    App.tableTools($('table'), { placeholder: 'Cari toko, kota, jenis...' });
    const uniq = k => [...new Set(D.stores(true).map(s => s[k]).filter(Boolean))].sort();
    $('chains').innerHTML = uniq('chain').map(v => `<option value="${App.esc(v)}">`).join('');
    $('cities').innerHTML = uniq('city').map(v => `<option value="${App.esc(v)}">`).join('');
  }

  function fill(s) {
    form.id.value = s ? s.id : '';
    form.name.value = s ? s.name : '';
    form.chain.value = s ? s.chain || '' : '';
    form.city.value = s ? s.city : '';
    form.address.value = s ? s.address || '' : '';
    form.active.checked = s ? s.active : true;
    $('formTitle').textContent = s ? 'Ubah toko' : 'Tambah toko';
  }

  const dlg = App.modal($('dlg'));
  $('openAdd').addEventListener('click', () => { fill(null); dlg.open(); });
  $('table').addEventListener('click', e => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    fill(D.store(b.dataset.id));
    dlg.open();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = form.name.value.trim(), city = form.city.value.trim();
    if (!name || !city) { App.toast('Isi nama toko dan kota.'); return; }
    const error = await App.busy(form, () => D.saveStore({ id: form.id.value || undefined, name, chain: form.chain.value.trim(), city, address: form.address.value.trim(), areaId: user.areaId || (D.areas()[0] || {}).id, active: form.active.checked }, user.id));
    if (error) { App.toast(error); return; }
    App.toast('Toko disimpan.');
    dlg.close();
    render();
  });

  render();
});
