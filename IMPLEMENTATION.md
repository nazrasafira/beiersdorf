# Implementation Plan — Page-by-Page Prototype

This plan replaces the current single-file mockup (`mockup/index.html`, the gallery of phone and browser frames) with **one real HTML page per screen** and a simple layout.
The pages are static and are served from GitHub Pages. They use mock data for now, and the same pages are later connected to the real backend (see §8).

> Status: built. Live at https://muhghifari.github.io/sales-daily-report/

---

## 1. What changes

| Now | After |
|-----|-------|
| One `mockup/index.html` containing every screen | One HTML file per screen |
| Screens drawn inside fake phone and browser frames | Each page *is* the app: full screen, no frames |
| Role tabs to switch screens | Real navigation links between pages; login sends you to your role's home page |
| Sidebar + cards + charts | Simple layout: top bar, content, navigation (see §3) |
| Screenshots folder | Removed. GitHub Pages is the preview. |

---

## 2. File structure

```
/
├── index.html                  → Masuk (login)
├── spg/
│   ├── beranda.html            → SPG home: big daily % ring, rank, streak
│   ├── laporan.html            → Fill in / edit daily report (per product)
│   ├── peringkat.html          → Team leaderboard (ranked by % of target)
│   └── riwayat.html            → Report history
├── leader/
│   ├── dashboard.html          → Team summary
│   ├── laporan.html            → Team reports list + one report's detail
│   ├── target.html             → Set targets
│   ├── tim.html                → Manage SPGs (add / deactivate)
│   └── pengaturan.html         → Working days, holidays, edit window
├── supervisor/
│   └── dashboard.html          → Team comparison across the area
├── admin/
│   └── produk.html             → Product catalog & prices
└── assets/
    ├── css/style.css           → All styles (one file)
    └── js/
        ├── data.js             → Mock data + data functions (later: real API)
        ├── common.js           → Rp/date formatting, header/nav, login check
        └── pages/              → One small script per page (only if the page needs JS)
```

Rules:
- **Relative links only** (`../spg/beranda.html`), so everything works under `https://muhghifari.github.io/sales-daily-report/`.
- No build step and no framework: plain HTML, CSS and JS that open directly in a browser.
- Each page includes only `style.css`, `data.js`, `common.js` and its own page script.

---

## 3. Layout (simple)

Design: minimal. White page, one accent (NIVEA blue), thin dividers instead of cards, plain text tabs and links. Dropdowns are searchable (type to filter). Dashboards show a daily sales trend chart (bars) with a dashed daily-target line.

Icons: one inline SVG line-icon set (Lucide, ISC license) in `assets/js/common.js` — no emoji anywhere in the UI.

One layout for every page, the same on phone and desktop:

```
┌──────────────────────────────────────┐
│  Laporan SPG          Sari W.  [Keluar] │  ← top bar (NIVEA blue)
├──────────────────────────────────────┤
│  Page title                           │
│                                       │
│  Content (single column, max 960px,   │
│  centered on desktop)                 │
│                                       │
├──────────────────────────────────────┤
│  Beranda | Isi Laporan | Riwayat      │  ← SPG: bottom nav on phone
└──────────────────────────────────────┘
```

- **SPG pages**: top bar + bottom navigation (4 items: Beranda, Isi Laporan, Peringkat, Riwayat). Designed for phones first.
- **Leader / Area / Admin pages**: top bar + a row of navigation links under it (it scrolls sideways on phones). No sidebar.
- Single column by default. Tables scroll sideways inside their own box on small screens, never the whole page.
- **No charts in v1** other than the SPG's daily % ring (plain SVG, no library). Elsewhere: progress bars and tables.
- Colors: NIVEA blue `#00136F`, white, light blue tints, plus green, amber and red only for status. Font: system font stack (nothing to download).

---

## 4. Pages

### 4.1 `index.html` — Masuk (hardcoded accounts)
- Username + password → "Masuk". WhatsApp OTP is postponed.
- Accounts are **hardcoded** in `data.js` (username, password, name, role, team):

  | Username | Password | Role | Name |
  |----------|----------|------|------|
  | `sari` | `spg123` | SPG | Sari Wulandari |
  | `dewi` | `spg123` | SPG | Dewi Lestari |
  | `rani` | `spg123` | SPG | Rani Kusuma |
  | *(other SPGs in the team, same pattern)* | `spg123` | SPG | |
  | `rina` | `leader123` | Leader | Rina Agustina |
  | `budi` | `super123` | Supervisor | Budi Santoso |
  | `admin` | `admin123` | Admin | Admin |

- Wrong username/password → "Username atau password salah".
- After login, redirect by role: SPG → `spg/beranda.html`, Leader → `leader/dashboard.html`, Supervisor → `supervisor/dashboard.html`, Admin → `admin/produk.html`.
- The logged-in user is kept in the browser (sessionStorage). "Keluar" clears it.
- **Demo only:**: the passwords sit in the page source, so anyone can read them. Replace this with real login before any real data goes in.

### 4.2 `spg/beranda.html` — Home (gamified)
The top of the page is about **today**, shown like a game score:

```
        ┌───────────────────────┐
        │      ╭───────╮        │
        │    ╱    67%    ╲      │   ← big circular ring = today's % of daily target
        │   │  Rp 1.245.000 │    │      (fills clockwise, color by level)
        │    ╲ / 1.852.000 ╱     │
        │      ╰───────╯        │
        │     Level Perak       │
        │ Rp 607.000 lagi → 100% │
        └───────────────────────┘
  Peringkat #5 dari 8          Streak 4 hari
  Rp 150.000 lagi untuk naik ke #4
```

- **Big ring**: today's sales ÷ today's target, in %. It can go past 100% (the ring fills, then shows a second lap / "120%").
- **Level for today**, based on the %:

  | % of daily target | Level | Icon | Ring color |
  |-------------------|-------|------|-----------|
  | 0–49% | Pemula | target | red |
  | 50–79% | Perunggu | bronze medal | amber |
  | 80–99% | Perak | silver medal | NIVEA blue |
  | 100–119% | Emas | gold medal | gold |
  | ≥ 120% | Berlian | gem | green |

- **Next goal**: "Rp X lagi untuk mencapai 100%" (or the next level).
- **Rank card**: "Peringkat #5 dari 8 (bulan ini)" plus how much more is needed to pass the person above. Links to `peringkat.html`.
- **Streak**: number of working days in a row the SPG hit 100% of the daily target. Missing a report breaks the streak; days off and holidays don't.
- Below that, smaller progress bars for **Minggu ini** and **Bulan ini** with "Sisa Rp X dalam N hari kerja → ± Rp Y/hari".
- If today's report isn't sent yet, the ring shows 0% and a big "Isi Laporan Hari Ini" button.
- After submitting a report that reaches a new level, show a short celebration message ("Selamat! Kamu mencapai Level Emas hari ini.").

### 4.2b `spg/peringkat.html` — Leaderboard
- Tabs: **Hari ini / Minggu ini / Bulan ini**.
- Ranked by **% of own target**, not by Rp, so SPGs with different targets compete fairly. Ties are broken by higher Rp.
- Top 3 shown as a podium (crown for #1, silver and bronze medals), then a list: rank, name, store, %, level badge.
- The logged-in SPG's row is highlighted and always visible (pinned at the bottom if it's off screen).
- Shows names and % only, not other SPGs' Rp amounts. *(Question for you: OK to show Rp too?)*

### 4.3 `spg/laporan.html` — Penjualan (per sale, during a shift)
- SPGs record sales **as they happen** instead of filling in the whole day at the end.
- **Start shift**: on Beranda (or this page) the SPG taps "Mulai shift". Sales can only be recorded during a shift today.
- **Record a sale**: search the product (type to filter) → quantity with − / + (default 1) → price is pre-filled and editable (promo) → "Simpan". Each sale is saved as one transaction with its time.
- Today's transactions are listed below, newest first, with a running total. A wrong entry can be removed ("Hapus").
- **End shift**: "Akhiri shift". A shift that ends with no sales counts as "Tidak ada penjualan".
- The day's report (total, per product, %, rank, streak) is built automatically from the transactions.
- Forgotten sales can still be added to a day inside the edit window (2 days); older days are locked unless a leader unlocks them.
- Leaders see shift status per SPG ("Aktif sejak 09:02", "Selesai 21:10", "Belum mulai"), each report's shift time and transactions with their times, and the CSV export has one row per transaction.

### 4.4 `spg/riwayat.html` — Riwayat
- Month selector.
- List of days, one row each: date, total Rp, number of products, status (Terkirim / Belum / Terkunci / Libur).
- Tap a row → opens `laporan.html?tanggal=YYYY-MM-DD`: editable if within 2 days, otherwise read-only.

### 4.5 `leader/dashboard.html` — Dashboard Tim
- Period filter: Hari ini / Minggu ini / Bulan ini.
- Summary: total sales, team target, % achieved, reports submitted today (x / y).
- "Belum lapor hari ini" list with a "Ingatkan WA" button (opens a `wa.me` link with a prefilled message, so no paid API is needed).
- SPG leaderboard table (same ranking as `spg/peringkat.html`): rank, name, store, sales, target, %, level, streak, today's status. Click a row → `laporan.html?spg=…`.
- Product table: product, qty, Rp.
- "Export Excel" button (prototype: downloads a CSV).

### 4.6 `leader/laporan.html` — Laporan Tim
- Filters: SPG, date range.
- List of reports. Click one to see its product lines.
- Leader can edit or unlock a locked report.

### 4.7 `leader/target.html` — Target
- Who can set targets: the **Team Leader** (own team) and the **Supervisor / Area Manager** (any team in the area). The last person to change a target is shown next to it ("diatur oleh Rina, 1 Okt").
- Month selector, with "27 hari kerja" shown for the month.
- One row per SPG: monthly target input; weekly and daily targets calculated next to it.
- Optional manual override for weekly/daily (highlighted when overridden).
- Buttons: "Terapkan ke semua", "Salin bulan lalu", "Simpan".

### 4.8 `leader/tim.html` — Kelola Tim
- SPG list: name, phone, store, active/inactive.
- "Tambah SPG" form: name, WhatsApp number, store.

### 4.9 `leader/pengaturan.html` — Pengaturan Tim
- Working days: 7 toggle buttons (Sen–Min).
- Holidays list: date, name, "tetap hari kerja?" toggle; add/remove.
- Report edit window: number of days (default 2).
- Reminder time (default 20:00).

### 4.10 `supervisor/dashboard.html` — Dashboard Area
- Same summary as the team dashboard, for the whole area.
- Team table: team, leader, SPG count, sales, target, %, reported today. Click → that team's dashboard (read-only view of `leader/dashboard.html?tim=…`).

### 4.11 `admin/produk.html` — Produk
- Product table: name, SKU, default price, active.
- Add / edit product form.

---

## 5. Data layer (`assets/js/data.js`)

All pages get data **only** through these functions, never by reading mock arrays directly. When the backend exists, only this file changes.

| Function | Used by |
|----------|---------|
| `login(username, password)` / `currentUser()` / `logout()` | all |
| `getMyProgress(date)` → today / week / month actual & target | spg/beranda |
| `getLevel(percent)` → level name, emoji, color | spg/beranda, spg/peringkat, leader/dashboard |
| `getLeaderboard(teamId, period)` → ranked list by % | spg/beranda, spg/peringkat, leader/dashboard |
| `getStreak(userId, date)` → days in a row at ≥ 100% | spg/beranda, leader/dashboard |
| `getReport(userId, date)` / `saveReport(report)` | spg/laporan, leader/laporan |
| `listReports({ userId?, teamId?, from, to })` | spg/riwayat, leader/laporan |
| `getProducts()` / `saveProduct(p)` | spg/laporan, admin/produk |
| `getTeamDashboard(teamId, period)` | leader/dashboard |
| `getTargets(teamId, month)` / `saveTargets(rows)` | leader/target |
| `getTeam(teamId)` / `saveSpg(spg)` | leader/tim |
| `getTeamSettings(teamId)` / `saveTeamSettings(s)` | leader/pengaturan |
| `areaSummary(areaId, period)` | supervisor/dashboard |

- Mock data: 1 area, 5 teams, 1 fully filled team (8 SPGs), 7 products, and October 2026 reports generated with a fixed random seed so the numbers are always the same.
- Data the user changes (reports, targets, settings) is kept in localStorage so the demo feels real. A "Reset data demo" link restores it.
- Target logic (daily = monthly ÷ working days, weekly = daily × working days in that week, overrides win, holidays respected) lives in one function, `effectiveTarget(user, periodType, date)`.

---

## 6. Order of work

1. **Clean up**: delete `mockup/` (page + screenshots), point the root `index.html` at the new login page.
2. **Foundation**: `style.css` (tokens, top bar, nav, cards, progress bar, table, form, buttons), `common.js` (formatting, header, nav, role guard), `data.js` with mock data and the target calculation.
3. **SPG pages**: login → beranda (ring, level, rank, streak) → laporan → peringkat → riwayat.
4. **Leader pages**: dashboard → target → laporan → tim → pengaturan.
5. **Area + Admin pages**.
6. **Check** (§7), then push. GitHub Pages updates automatically.

Each step is a separate commit, so you can review the SPG pages on GitHub Pages before the leader pages are built.

---

## 7. Done when

- [ ] Every page opens on its own by URL, with no gallery or frames.
- [ ] Every hardcoded account logs in and lands on its role's home page; a wrong password shows an error; opening another role's page redirects to login.
- [ ] Beranda shows the big daily % ring with the right level color; submitting a report updates the ring, level, rank and streak.
- [ ] Leaderboard ranks by % of target and highlights the logged-in SPG.
- [ ] Works at 375px phone width with no sideways page scroll; tables scroll inside their box.
- [ ] A report submitted on `laporan.html` shows on `beranda.html`, `riwayat.html` and the leader dashboard.
- [ ] Changing a monthly target updates the weekly/daily values and the SPG's Beranda.
- [ ] All links work on GitHub Pages (relative paths).
- [ ] No errors in the browser console.

---

## 8. After the prototype (not in this round)

The pages stay. Only `data.js` is swapped from mock data to real calls, depending on the backend decision still open in `PLAN.md`:
- **Google Sheets + Apps Script** (Rp 0): `data.js` calls the Apps Script web app URL.
- **Server + database**: `data.js` calls the API.

---

## 9. Questions before coding

1. **Country**: you mentioned the UK. Is the client's market the UK (English text, £, UK holidays) or Indonesia (Bahasa Indonesia, Rp)? This plan currently assumes Indonesia.
2. **Supervisor**: is "Supervisor" the same role as Area Manager (above several Team Leaders)? If so, I'll call it "Supervisor" on screen.
3. **Leaderboard privacy**: can SPGs see each other's Rp amounts, or only the %?
4. Is the page list in §2 right? Anything to add or drop?
5. OK to delete the old `mockup/` folder?
