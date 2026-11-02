/*
 * Dummy sell in and offtake for the local dev server, on top of tools/fixtures/demo-data.json: every month of the year so far
 * gets store targets and filled-in numbers, and the running month is left partly empty, so every status can be seen.
 * Sari's store stays empty in the running month, to try entering a sell out. Made-up numbers, always the same ones.
 */
function seedDummyData(ctx) {
  const today = ctx.today_(), thisMonth = today.slice(0, 7), year = today.slice(0, 4);
  const targets = ctx.rows_('StoreTargets');
  const latest = targets.map(t => t.month).filter(m => m <= thisMonth).sort().pop();
  const base = targets.filter(t => t.month === latest && t.user_id);
  const months = [];
  for (let m = 1; m <= +thisMonth.slice(5); m++) months.push(year + '-' + String(m).padStart(2, '0'));

  // Earlier months had the same stores and SPGs
  const have = new Set(targets.map(t => t.store_id + '|' + t.month));
  const addTargets = [];
  months.forEach(month => base.forEach(t => {
    if (have.has(t.store_id + '|' + month)) return;
    addTargets.push({ store_id: t.store_id, month, user_id: t.user_id, monthly: t.monthly, weekly: null, daily: null, set_by: t.set_by, set_at: month + '-01' });
  }));
  ctx.append_('StoreTargets', addTargets);

  const sold = {};
  ctx.rows_('Sales').forEach(s => { if (!s.deleted) { const k = s.store_id + '|' + s.date.slice(0, 7); sold[k] = (sold[k] || 0) + (s.subtotal || 0); } });
  const round = n => Math.round(n / 1000) * 1000;
  const rows = [];
  months.forEach((month, m) => base.forEach((t, i) => {
    const running = month === thisMonth;
    const wave = 0.8 + ((i * 7 + m * 3) % 9) * 0.05; // 80%–120% of the sales or target, different per store and month
    const reported = sold[t.store_id + '|' + month] || t.monthly * 0.9;
    // Running month: a mix of all four statuses
    const hasSellIn = !running || i % 2 === 0, hasOfftake = !running || (i % 3 === 0 && t.user_id !== 'u-sari');
    if (!hasSellIn && !hasOfftake) return;
    rows.push({
      id: 'sa-dummy-' + t.store_id + '-' + month, store_id: t.store_id, month,
      sell_in: hasSellIn ? round(t.monthly * (0.9 + (i % 5) * 0.08)) : null, sell_in_by: hasSellIn ? t.set_by : '', sell_in_at: hasSellIn ? month + '-05 10:00' : '',
      actual: hasOfftake ? round(reported * wave) : null, actual_by: hasOfftake ? t.user_id : '', actual_at: hasOfftake ? month + '-28 17:00' : '',
      note: hasOfftake && i % 4 === 0 ? 'Setelah diskon toko' : '',
    });
  }));
  ctx.append_('StoreActuals', rows);
  return `Data dummy: ${addTargets.length} target, ${rows.length} sell in & offtake.`;
}
module.exports = { seedDummyData };
