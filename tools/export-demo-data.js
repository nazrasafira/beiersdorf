#!/usr/bin/env node
/*
 * Exports the starting data in assets/js/data.js (Admin, product catalog, stores) for the Google Sheet:
 * - apps-script/demo-data.json: for the Apps Script importDemoData() (menu "Isi data demo…", empty Sheet only)
 * - apps-script/products.csv: the Products tab rows in its column order, to paste into the Products tab
 * Usage: node tools/export-demo-data.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const sandbox = { window: {}, console };
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/data.js'), 'utf8'), sandbox);
const D = sandbox.window.Data;
const state = D.exportState();
const out = path.join(root, 'apps-script/demo-data.json');
fs.writeFileSync(out, JSON.stringify({ today: D.TODAY, ...state }));
console.log(`wrote ${out} (${Math.round(fs.statSync(out).size / 1024)} KB)`);

// Same columns as TABLES.Products in apps-script/Db.gs
const cols = ['id', 'name', 'sku', 'price', 'photo', 'active', 'created_by', 'updated_by', 'updated_at', 'brand', 'barcode'];
const cell = v => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
const rows = state.products.map(p => [p.id, p.name, p.sku, p.price, '', p.active ? 'TRUE' : 'FALSE', p.createdBy, p.updatedBy, p.updatedAt, p.brand || '', p.barcode || '']);
const csv = path.join(root, 'apps-script/products.csv');
fs.writeFileSync(csv, [cols, ...rows].map(r => r.map(cell).join(',')).join('\n') + '\n');
console.log(`wrote ${csv} (${rows.length} products)`);
