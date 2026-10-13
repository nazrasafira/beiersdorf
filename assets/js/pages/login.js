Data.ready(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('form'), pwForm = $('pwForm');
  const existing = Data.currentUser();

  // After a password reset the server asks for a new password before anything else
  const demo = $('demo'), reset = $('reset'); // demo accounts box (not on every server)
  function askNewPassword(u) {
    form.hidden = true;
    if (demo) demo.hidden = true;
    $('pwName').textContent = u.name.split(' ')[0];
    pwForm.hidden = false;
    $('newPw').focus();
  }
  if (existing && Data.mustChangePassword()) askNewPassword(existing);
  else if (existing) { location.replace(App.home(existing)); return; }

  if (App.BRAND_LOGO) $('mark').outerHTML = App.logoImg();
  if (Data.LIVE) {
    $('rememberRow').hidden = false;
    if (reset) reset.closest('p').hidden = true;
    if (demo && !Data.CONFIG.demoAccounts) demo.hidden = true;
  }

  // Show / hide password
  const pwBtn = $('pwToggle');
  pwBtn.addEventListener('click', () => {
    const show = form.password.type === 'password';
    form.password.type = show ? 'text' : 'password';
    pwBtn.setAttribute('aria-pressed', show);
    pwBtn.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
    pwBtn.title = pwBtn.getAttribute('aria-label');
    pwBtn.querySelector('.eye').hidden = show;
    pwBtn.querySelector('.eye-off').hidden = !show;
    form.password.focus();
  });
  const err = $('err');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const u = await App.busy(form, () => Data.login(form.phone.value, form.password.value, form.remember.checked));
    if (!u) {
      err.textContent = Data.lastError() || 'Nomor HP atau password salah.';
      err.hidden = false;
      form.password.value = '';
      form.password.focus();
      return;
    }
    if (Data.mustChangePassword()) { askNewPassword(u); return; }
    location.href = App.home(u);
  });

  pwForm.addEventListener('submit', async e => {
    e.preventDefault();
    const pw = $('newPw').value, pw2 = $('newPw2').value;
    let error = pw.length < 6 ? 'Password minimal 6 karakter.' : pw !== pw2 ? 'Konfirmasi password tidak sama.' : null;
    if (!error) error = await App.busy(pwForm, () => Data.changePassword('', pw, pw2));
    if (error) { $('pwErr').textContent = error; $('pwErr').hidden = false; return; }
    location.href = App.home(Data.currentUser());
  });
  $('pwCancel').addEventListener('click', async e => {
    e.preventDefault();
    await Data.logout();
    location.reload();
  });

  // Demo accounts: click to fill the form
  document.querySelectorAll('[data-user]').forEach(row => row.addEventListener('click', () => {
    form.phone.value = row.dataset.user;
    form.password.value = row.dataset.pass;
    err.hidden = true;
    form.querySelector('button[type=submit]').focus();
  }));

  if (reset) reset.addEventListener('click', e => {
    e.preventDefault();
    if (!confirm('Kembalikan semua data demo ke awal? Laporan, target, dan pengaturan yang diubah akan hilang.')) return;
    Data.reset();
    location.reload();
  });
});
