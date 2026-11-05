/*
 * Dummy sell in and offtake for the local dev server, on top of tools/fixtures/demo-data.json: every month of the year so far
 * gets store targets and filled-in numbers, and the running month is left partly empty, so every status can be seen.
 * Sari's store stays empty in the running month and last month, to try entering a sell out. Sell out is in product lines
 * (units and price); SPGs and stores also get made-up codes for the Excel. Made-up numbers, always the same ones.
 */
const fs = require('fs');
const path = require('path');

// The test data has a handful of products; add the real catalog (apps-script/products.csv) so the sell out form is full size
function addCatalog(ctx) {
  const have = new Set(ctx.rows_('Products').map(p => p.id));
  const [head, ...lines] = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'products.csv'), 'utf8').trim().split('\n');
  const cols = head.split(',');
  const rows = lines.map(l => Object.fromEntries(l.split(',').map((v, i) => [cols[i], cols[i] === 'price' ? +v : cols[i] === 'active' ? v === 'TRUE' : v])))
    .filter(p => p.id && !have.has(p.id));
  ctx.append_('Products', rows);
  return rows.length;
}

function seedDummyData(ctx) {
  const catalog = addCatalog(ctx);
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
  const products = ctx.rows_('Products').filter(p => p.active && p.price > 0);
  const lastMonth = months[months.length - 2];
  // About a dozen products per store, sized so the value comes close to `aim`
  const itemsFor = (aim, i, m) => {
    const pick = products.filter((p, k) => (k + i * 5 + m) % 14 === 0).slice(0, 14);
    const items = [];
    let total = 0;
    pick.forEach((p, k) => {
      const qty = Math.max(1, Math.round(aim / pick.length / p.price * (0.6 + (k % 5) * 0.2)));
      items.push(['d' + k, p.id, qty, p.price]);
      total += qty * p.price;
    });
    return { json: JSON.stringify(items), total };
  };
  const rows = [];
  months.forEach((month, m) => base.forEach((t, i) => {
    const running = month === thisMonth;
    const wave = 0.8 + ((i * 7 + m * 3) % 9) * 0.05; // 80%–120% of the sales or target, different per store and month
    const reported = sold[t.store_id + '|' + month] || t.monthly * 0.9;
    // Running month: a mix of all four statuses
    const hasSellIn = !running || i % 2 === 0, hasOfftake = (!running || i % 3 === 0) && !(t.user_id === 'u-sari' && (running || month === lastMonth));
    if (!hasSellIn && !hasOfftake) return;
    rows.push({
      id: 'sa-dummy-' + t.store_id + '-' + month, store_id: t.store_id, month,
      sell_in: hasSellIn ? round(t.monthly * (0.9 + (i % 5) * 0.08)) : null, sell_in_by: hasSellIn ? t.set_by : '', sell_in_at: hasSellIn ? month + '-05 10:00' : '',
      ...(hasOfftake ? (x => ({ sell_out: x.total, sell_out_items: x.json }))(itemsFor(reported * wave, i, m)) : { sell_out: null, sell_out_items: '' }),
      sell_out_by: hasOfftake ? t.user_id : '', sell_out_at: hasOfftake ? month + '-28 17:00' : '',
      note: hasOfftake && i % 4 === 0 ? 'Setelah diskon toko' : '',
    });
  }));
  ctx.append_('SellInSellOut', rows);

  // Codes as in the company's sell out form
  ctx.rows_('Users').filter(u => u.role === 'spg').forEach((u, i) => { u.nma_code = 'NBCJKT' + String(101 + i).padStart(3, '0'); ctx.save_('Users', u); });
  ctx.rows_('Stores').forEach((st, i) => { st.code = 'JKT' + String(1001 + i); ctx.save_('Stores', st); });
  return `Data dummy: ${catalog} produk katalog, ${addTargets.length} target, ${rows.length} sell in & sell out.`;
}
module.exports = { seedDummyData };
