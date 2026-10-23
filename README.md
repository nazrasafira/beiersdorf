# Laporan Penjualan Harian (NIVEA)

Prototype of a daily sales report app for SPGs, Team Leaders and Managers (area Bogor). Static HTML/CSS/JS with demo data; no server needed.

**Live demo:** https://muhghifari.github.io/sales-daily-report/

## Starting data

The app starts with the **Admin** account, the product catalog and the stores; there are no other people, teams or sales.

| Role | Phone | Password | Lands on |
|------|-------|----------|----------|
| Admin | `0811 0000 0001` | `admin123` | Pengguna |

Log in with **phone number + password** (any format works: `0811 0000 0001`, `62811…`, `+62 811-…`). The Admin adds Managers and Team Leaders (Pengguna); Team Leaders add their SPGs and set each SPG's working days and hours (Tim), give each store to an SPG and set the store targets (Target). New accounts start with `manager123`, `leader123` or `spg123` and must choose their own password at the first login.

- **Products**: the 199 SKUs of the client's file *SOH OFFTAKE YCA & LSI PJR AGUST'26 FILE BARU 199 SKU* (KODE SKU, Nama SKU di HO, Subbrand, price, barcode), kept in `assets/js/data.js`.
- **Stores**: the 16 NMA stores (Yogya Cimanggu, LSI Pajajaran, AEON Sentul City, … Yogya Ciranjang).

In demo mode (`backend: 'demo'`) changes are saved in your browser; clear the site's data in the browser to start over. The Admin password is in `assets/js/data.js` and visible to anyone: change it after the first login on a real server.

## Pages

| Page | Who |
|------|-----|
| `index.html` — Masuk | everyone |
| `spg/beranda.html` — big daily % ring, level, rank, streak, week/month progress | SPG |
| `spg/laporan.html` — Penjualan: start shift at a chosen store, switch store, record each sale, end shift | SPG (Leader/Manager can edit too) |
| `spg/peringkat.html` — team leaderboard by % of target | SPG |
| `spg/riwayat.html` — report history per month | SPG |
| `leader/dashboard.html` — team summary, SPG ranking, SPGs scheduled today who have not started, sales per store/product, CSV and daily recap Excel | Leader, Manager |
| `leader/laporan.html` — team reports as cards (details, edit, lock/unlock), 20 per page | Leader, Manager |
| `leader/target.html` — per month: which SPG holds each store and the store's target (auto weekly/daily, overrides); an SPG's target is the sum of their stores | Leader, Manager |
| `leader/tim.html` — SPGs: add, edit name/phone, deactivate, reset password, **schedule per SPG** (working days and hours) | Leader, Manager |
| `leader/pengaturan.html` — team default working days (for SPGs without their own schedule), holidays, edit window | Leader, Manager |
| `manager/dashboard.html` — Manager's area dashboard: team comparison, top SPGs | Manager |
| `katalog/produk.html` — shared product catalog (add and edit any product) | Admin, Manager, Leader |
| `katalog/toko.html` — shared store list (add and edit any store) | Admin, Manager, Leader |
| `admin/pengguna.html` — add / edit / deactivate / reset Managers and Team Leaders (warning before a second leader in a team), daily recap | Admin |

See [`PLAN.md`](PLAN.md) for the product plan, [`IMPLEMENTATION.md`](IMPLEMENTATION.md) for how the prototype is built, [`IMPLEMENTATION-GOOGLE-SHEETS.md`](IMPLEMENTATION-GOOGLE-SHEETS.md) for the plan to run it on Google Sheets, and [`IMPLEMENTATION-WEB.md`](IMPLEMENTATION-WEB.md) for the Laravel + MySQL web version.

## Targets

Targets are set **per store and month** (Target page). Each store is held by one SPG that month; an SPG may hold several stores, and their target is the sum of those stores' targets (daily = each store's monthly target over the working days of the SPG who holds it, unless overridden). A store held by an active SPG of another team can't be taken; a store becomes free again when its SPG is removed from it or deactivated. **Salin bulan lalu** copies last month's SPGs and targets. In a month nobody has set up yet, a store stays with the team that held it before until that team releases it (Lepas toko). Months that are over are read-only. Manual targets must fit: daily ≤ weekly ≤ monthly.

## Roles and schedules

- **Manager** is the area role (role `manager`; Sheets made before the rename said `supervisor`, which the app reads as `manager` and **Siapkan tab** rewrites). The area is **Bogor**.
- Each SPG can have their **own schedule**: working days of the week and working hours (e.g. Mon–Fri 10:00–19:00), set by their Team Leader or Manager in **Tim → Atur jadwal**. SPGs without one follow the team's default working days (Pengaturan). Team holidays apply to everyone. The schedule decides the SPG's daily target, who is expected to start a shift today, and OFF / MISSING in the daily recap.

## Google Sheets backend

`apps-script/` holds the Google Apps Script backend: the Google Sheet is the database, photos go to Google Drive. Set `assets/js/config.js` to `{ backend: 'sheets', url: '<web app URL>' }` to use it; setup steps: [`SETUP-GOOGLE-SHEETS.md`](SETUP-GOOGLE-SHEETS.md). Local development without Google: `node tools/sheets-dev-server.js` (with made-up teams, SPGs and sales from `tools/fixtures/demo-data.json`, also used by the tests). After changing the starting data in `assets/js/data.js`, run `node tools/export-demo-data.js` (writes `apps-script/demo-data.json` and `apps-script/products.csv`).

## Publishing changes

After editing any page, run `python3 tools/bump-version.py` before committing. It stamps a new version on every page and in `assets/version.json`; pages that a browser still has cached detect the newer version and reload themselves, so nobody sees a mix of old and new pages.

## Photos

- **Profile photos**: SPGs tap their photo on Beranda to take or choose a new one; Team Leaders can set an SPG's photo in Kelola Tim. Users without a photo (or whose photo can't be loaded) get `assets/avatars/default.svg`. The Admin starts with an illustrated portrait in `assets/avatars/` (DiceBear "Lorelei" by Lisa Wischofsky, CC0 1.0, generated with `tools/generate-avatars.js`).
- **Store photos**: Admin, Managers and Team Leaders can add a storefront photo (Katalog → Toko, cropped to 4:3). Stores start with a drawing (`assets/stores/placeholder.svg`).
- **Product photos**: Admin can upload a photo per product. Products start with a placeholder image (`assets/products/placeholder.svg`) until a packshot is uploaded.
- Uploaded photos are resized in the browser and stored with the demo data.
- **Logo**: see `assets/brand/README.md`.
