Data.ready(function () {
  'use strict';
  const user = App.init({ roles: ['supervisor'] });
  if (!user) return;
  const D = Data, $ = id => document.getElementById(id);
  const SHOW = 5; // top SPGs shown before "Lihat semua"
  let period = 'month', allSpgs = false;

  function render() {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.p === period));
    const a = D.areaSummary(user.areaId, period, D.TODAY);
    $('title').textContent = 'Area ' + a.area.name;
    $('sub').textContent = `${a.teams.length} tim · ${a.size} SPG · ${App.dateLong(D.TODAY)}`;

    $('hero').innerHTML = App.dashHero(a, period);
    App.animateRings();

    const [cf, ct] = D.chartRange(period, D.TODAY);
    App.trendChart($('trend'), D.dailySeries(a.teams.flatMap(t => t.lb.map(r => r.user.id)), a.teams.map(t => t.team.id), cf, ct));

    // Teams, best first: tap one to open its dashboard
    $('teams').innerHTML = a.teams.map((t, i) => {
      const leader = D.user(t.team.leaderId);
      return `<button type="button" class="rk" data-id="${t.team.id}" title="Leader: ${App.esc(leader ? leader.name : '-')}">
        ${App.rankBadge(i + 1)}
        ${App.avatar(leader)}
        <span class="grow">
          <span class="top"><b>Tim ${App.esc(t.team.name)}</b><b class="pct">${App.pct(t.pct)}</b></span>
          ${App.bar(t.pct)}
          <span class="meta"><span>${App.rpShort(t.actual)} / ${App.rpShort(t.target)}</span>
            <span class="pill ${t.reported === t.due ? 'ok' : 'warn'}">Shift ${t.reported}/${t.due}</span></span>
        </span>
      </button>`;
    }).join('') || '<p class="empty">Belum ada tim di area ini.</p>';

    // Best SPGs in the area: podium on wide screens, rows everywhere
    $('podium').innerHTML = App.podium(a.topSpgs, null, r => 'Tim ' + D.team(r.user.teamId).name);
    $('spgs').innerHTML = a.topSpgs.slice(0, allSpgs ? a.topSpgs.length : SHOW).map((r, i) => `
      <div class="rk">
        ${App.rankBadge(i + 1)}
        ${App.avatar(r.user)}
        <span class="grow">
          <span class="top"><b>${App.esc(r.user.name)}</b><b class="pct">${App.pct(r.pct)}</b></span>
          ${App.bar(r.pct)}
          <span class="meta"><span>${App.rpShort(r.actual)} / ${App.rpShort(r.target)} · Tim ${App.esc(D.team(r.user.teamId).name)}</span></span>
        </span>
      </div>`).join('') || '<p class="empty">Belum ada SPG.</p>';
    $('spgsMore').hidden = a.topSpgs.length <= SHOW;
    $('spgsMore').textContent = allSpgs ? 'Tampilkan lebih sedikit' : `Lihat semua ${a.topSpgs.length} SPG`;
  }

  $('teams').addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (b) location.href = App.page('../leader/dashboard.html') + '?tim=' + b.dataset.id;
  });
  $('spgsMore').addEventListener('click', () => { allSpgs = !allSpgs; render(); });
  $('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { period = b.dataset.p; render(); } });
  render();
});
