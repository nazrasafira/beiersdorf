# Sales Daily Report — Project Plan

A simple, mobile-first web app where **SPG / sales staff** submit their daily sales report (per product) and track progress against their targets, **Leaders** set those targets and monitor their team, and **Area Managers** see the combined picture across teams.

> Status: planning only. No code yet.

---

## 0. Decisions (confirmed)

| # | Topic | Decision |
|---|-------|----------|
| 1 | Target metric | **Sales amount in Rupiah (Rp)** only |
| 2 | Report detail | **Per product** (SPG enters each product sold; totals are calculated) |
| 3 | Hierarchy | **Area Manager → Leader → SPG** (Area Manager level included) |
| 4 | Working days & holidays | **Customizable** per team (working days, holidays, and whether holidays reduce the target) |
| 5 | Edit window | SPG can edit a report for **2 days** after the report date, then it locks |
| 6 | Language | **Bahasa Indonesia** UI |
| 7 | Login | **Phone number + WhatsApp OTP** |
| 8 | Scale | **Fewer than 50 users** at launch |

---

## 1. Goals

| # | Goal |
|---|------|
| G1 | An SPG can submit a daily per-product sales report in about 1–2 minutes from a phone. |
| G2 | An SPG can see their **daily, weekly, and monthly** Rp target and how much of it they've achieved. |
| G3 | A Leader can set targets for each SPG (or the whole team at once). |
| G4 | A Leader can see the **cumulative** report for their team: totals, per-SPG and per-product breakdown, achievement %, and who hasn't reported today. |
| G5 | An Area Manager can see the same, rolled up across all their teams. |

### Out of scope for v1
- Inventory / stock management
- Payroll, commissions, incentives calculation
- Integration with POS systems
- Native mobile apps (the web app will be installable on phones as a PWA instead)

---

## 2. Users & Roles

| Role | Description | Can do |
|------|-------------|--------|
| **SPG** | Field / in-store salesperson | Submit & edit own daily report (within 2 days), view own history, view own targets & achievement |
| **Leader** | Supervises one team of SPGs | View own team's reports & dashboard; set targets; edit/unlock team reports; manage SPG accounts in the team |
| **Area Manager** | Supervises several Leaders/teams | View all teams in their area; compare teams; set/override targets; manage Leaders, teams, stores |
| **Admin** | Owner / back-office (can be the same person as the top Area Manager) | Manage products & prices, all users, global settings |

---

## 3. Core Features

### 3.1 Login — Phone + WhatsApp OTP
- User enters phone number (format `08xx` / `+62`, normalized to `62…`).
- A 6-digit OTP is sent via **WhatsApp**; valid 5 minutes, max 5 attempts, resend after 60 s.
- Session stays logged in for 30 days on that device so SPGs don't need an OTP every day.
- No public sign-up: only phone numbers registered by a Leader/Admin can log in.
- WhatsApp provider options (pick one before build):
  - **Fonnte** / **Wablas** — Indonesian providers, cheap, quick setup via a normal WA number. Good fit for < 50 users.
  - **Meta WhatsApp Cloud API** — official, needs business verification and an approved "authentication" template; more setup, more reliable long-term.
- Fallback: Admin can generate a one-time login code manually if WhatsApp is down.

### 3.2 SPG: Daily Report (per product)
Form:
- **Tanggal (Date)** — defaults to today; allowed: today and the previous 2 days; no future dates.
- **Toko (Store)** — defaults to SPG's assigned store.
- **Product lines** — add one row per product sold:
  - Product (searchable dropdown from product catalog)
  - Qty
  - Price per unit — pre-filled from catalog, **editable** (discounts/promos)
  - Line total = qty × price (auto)
- **Total penjualan** — auto-summed from lines (read-only).
- **Catatan (Notes)** — optional.
- "Tidak ada penjualan hari ini" (no sales today) option so a zero day still counts as submitted.

Rules:
- One report per SPG per day (editing updates it, never duplicates).
- SPG can edit until **report date + 2 days** (end of day, team timezone). After that it is **locked**; Leader/Area Manager can still edit or unlock.
- Every edit is recorded in an audit log.
- The edit window (2 days) is stored as a setting so it can be changed later.

### 3.3 SPG: My Targets & Progress (Beranda / Home)
```
┌──────────── Hari Ini ───────────┐
│ Rp 1.250.000 / Rp 2.000.000     │
│ ███████████░░░░░░░  62%         │
└─────────────────────────────────┘
┌──────────── Minggu Ini ─────────┐
│ Rp 6.800.000 / Rp 12.000.000    │
│ ██████████░░░░░░░░  57%         │
│ Sisa: Rp 5,2 jt dalam 3 hari    │
│ → perlu ± Rp 1,73 jt/hari       │
└─────────────────────────────────┘
┌──────────── Bulan Ini ──────────┐
│ Rp 21,4 jt / Rp 50 jt     43%   │
└─────────────────────────────────┘
```
- "Remaining per day" uses remaining **working days** only.
- Top products this month (by Rp).
- History list/calendar of past reports: submitted / missing / locked.

### 3.4 Targets (Leader / Area Manager)
- Targets are in **Rp**, per SPG, for periods: **daily, weekly, monthly**.
- **Bulk set**: same target for all SPGs in a team, or **copy last month**.
- **Auto-derive** from the monthly target so the Leader normally sets one number per SPG:
  - daily = monthly ÷ working days in the month
  - weekly = daily × working days in that week
  - An explicitly set weekly or daily target **overrides** the derived value.
- Area Manager can set/override targets for any team in their area.

### 3.5 Working Days & Holidays (customizable)
Per-team settings:
- **Working days** — choose weekdays (e.g. Mon–Sat, or all 7 days for mall SPGs).
- **Holidays** — list of dates (preload Indonesian national holidays / cuti bersama; editable).
- **Holiday counts as working day?** — toggle per holiday (some stores are busiest on holidays).
- Changing these recalculates derived daily/weekly targets from that point on.
- Optional per-SPG day off (libur/izin) — phase 2.

### 3.6 Leader Dashboard (team)
- **Period filter**: hari ini / minggu ini / bulan ini / custom range.
- **Team summary**: total sales Rp, team target, achievement %.
- **Per-SPG table**: sales, target, achievement %, sortable (leaderboard).
- **Per-product breakdown**: qty & Rp per product for the team.
- **Submission status**: who hasn't submitted today, with a WhatsApp reminder button.
- **Trend chart**: daily sales vs. target line.
- **Drill-down**: SPG → their daily reports and product lines.
- **Export** to Excel.

### 3.7 Area Manager Dashboard
- Same as Leader dashboard but aggregated across teams.
- **Team comparison** table: each team's sales, target, achievement %.
- Drill down: area → team → SPG → report.

### 3.8 Product Catalog (Admin)
- Product name, SKU (optional), category (optional), default price, active/inactive.
- Price changes don't alter past reports (price is saved on each report line).

### 3.9 Notifications (WhatsApp)
- Reminder to SPGs with no report by a set time (e.g. 20:00 WIB).
- Daily summary to Leaders (team total vs. target, missing reports).
- Uses the same WhatsApp provider as the OTP.

---

## 4. Data Model (draft)

```
areas
  id, name, manager_id

teams
  id, name, area_id, leader_id,
  working_days (e.g. [1,2,3,4,5,6]), timezone (default Asia/Jakarta),
  report_edit_days (default 2)

stores
  id, name, address, team_id

users
  id, name, phone (unique, 62…), role (SPG | LEADER | AREA_MANAGER | ADMIN),
  team_id (SPG/Leader), area_id (Area Manager), store_id (SPG),
  is_active, created_at

otp_codes
  id, phone, code_hash, expires_at, attempts, used_at

products
  id, name, sku, category, default_price, is_active

daily_reports
  id, user_id, store_id, report_date, total_amount, notes,
  no_sales (bool), locked (bool), created_at, updated_at
  UNIQUE (user_id, report_date)

report_items
  id, report_id, product_id, qty, unit_price, line_total

targets
  id, user_id, period_type (DAILY | WEEKLY | MONTHLY),
  period_start (date), amount (Rp),
  set_by, created_at, updated_at
  UNIQUE (user_id, period_type, period_start)

holidays
  id, team_id (null = all teams), date, name, is_working_day (bool)

audit_logs
  id, actor_id, entity, entity_id, action, before_json, after_json, created_at
```

Money stored as **integer Rupiah** (no decimals).

### Key calculations
- **Actual (period)** = Σ `daily_reports.total_amount` for dates in period.
- **Effective target** = explicit target if set, else derived from the monthly target using the team's working days and holidays.
- **Achievement %** = actual ÷ effective target.
- **Week** = Monday–Sunday. **Month** = calendar month. All dates in the team's timezone (WIB by default).

---

## 5. Screens (in Bahasa Indonesia)

### SPG
1. Masuk (Login) — phone → OTP
2. **Beranda** — target progress cards + "Isi Laporan Hari Ini" button
3. **Isi / Ubah Laporan** — per-product form
4. **Riwayat** — past reports

### Leader
1. **Dashboard Tim**
2. **Detail SPG**
3. **Target** — SPG × period grid, bulk actions
4. **Kelola Tim** — add/deactivate SPGs, assign stores
5. **Pengaturan Tim** — working days, holidays, edit window

### Area Manager
1. **Dashboard Area** — team comparison
2. Drill-down into any team (reuses Leader screens, read + edit)
3. **Kelola Tim & Leader**

### Admin
1. **Produk** — catalog & prices
2. **Pengguna** — all users
3. **Pengaturan** — WhatsApp provider, global holidays

---

## 6. Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| App | **Next.js** (App Router, TypeScript) | One codebase for UI and API |
| UI | **Tailwind CSS** + **shadcn/ui** | Fast, mobile-friendly |
| Database | **PostgreSQL** (Supabase or Neon, free tier) | Good for aggregations; < 50 users fits free tier easily |
| ORM | **Prisma** | Type-safe queries, migrations |
| Auth | Custom phone + WhatsApp OTP, session cookie (via **Auth.js** credentials provider or `iron-session`) | Supabase/Auth.js phone auth defaults to SMS, so OTP delivery via WhatsApp is done by us |
| WhatsApp | **Fonnte** (recommended to start) or Meta Cloud API | OTP + reminders |
| Charts | **Recharts** | Dashboard charts |
| Export | **SheetJS (xlsx)** | Excel export |
| Scheduled jobs | **Vercel Cron** | Daily reminders & summaries |
| Hosting | **Vercel** | Free/low-cost at this scale |
| Formatting | `Intl.NumberFormat('id-ID')`, `date-fns` with `id` locale | Rp and Indonesian dates |

Estimated running cost at < 50 users: hosting & DB on free tiers; main cost is the WhatsApp provider (Fonnte packages start at roughly the price of a small monthly subscription).

---

## 7. Permissions Matrix

| Action | SPG | Leader | Area Mgr | Admin |
|--------|:---:|:------:|:--------:|:-----:|
| Submit own report | Yes | – | – | – |
| Edit own report (≤ 2 days) | Yes | – | – | – |
| Edit/unlock team reports | No | Yes own team | Yes own area | Yes |
| View own targets & progress | Yes | – | – | – |
| View team data | No | Yes own team | Yes own area | Yes |
| Set targets | No | Yes own team | Yes own area | Yes |
| Team settings (working days, holidays) | No | Yes own team | Yes own area | Yes |
| Manage SPGs | No | Yes own team | Yes own area | Yes |
| Manage Leaders / teams / stores | No | No | Yes own area | Yes |
| Manage products & prices | No | No | No | Yes |
| Export | No | Yes | Yes | Yes |

All checks enforced **server-side**.

---

## 8. Delivery Phases

### Phase 0 — Setup (≈ 1–2 days)
- Next.js project, lint/format, Prisma + Postgres, deploy to Vercel.
- Seed data: 1 area, 2 teams, 2 leaders, ~10 SPGs, ~15 products, 1 month of reports.
- Pick and register WhatsApp provider.

### Phase 1 — MVP (≈ 2–3 weeks)
- WhatsApp OTP login + roles
- Product catalog (Admin)
- SPG: per-product daily report, 2-day edit window, Beranda with daily/weekly/monthly progress
- Team settings: working days + holidays
- Leader: monthly targets with auto-derived weekly/daily, bulk set / copy last month
- Leader dashboard: totals, per-SPG table, per-product breakdown, missing reports
- Area Manager dashboard: team comparison + drill-down
- Bahasa Indonesia throughout

### Phase 2 — Improvements (≈ 1–2 weeks)
- Weekly/daily target overrides
- Trend charts, custom date ranges
- Excel export
- Audit log viewer, unlock reports
- WhatsApp reminders & daily summaries
- PWA install
- Per-SPG days off

### Phase 3 — Nice to have
- Per-product targets
- Photo attachments (receipt / display)
- Incentive estimates based on achievement
- English language option

---

## 9. Testing Plan
- **Unit**: target derivation (custom working days, holidays with/without working-day flag, overrides), achievement %, week/month boundaries, 2-day edit window at midnight WIB, Rp formatting, phone normalization.
- **Integration**: permission checks at every role level (SPG ↔ other SPG, Leader ↔ other team, Area Manager ↔ other area); OTP expiry, attempt limits, and rate limiting.
- **E2E (Playwright)**: SPG logs in → submits per-product report → Leader and Area Manager dashboards update; Leader sets monthly target → SPG sees derived daily/weekly target.
- **Pilot**: one real team for 1–2 weeks before rolling out to everyone.

---

## 10. Remaining Questions (can be settled during Phase 0)
1. **WhatsApp provider**: Fonnte (quick, cheap) or official Meta Cloud API?
2. **Price editing**: can SPGs change the unit price freely, or only choose from set promo prices?
3. **Product catalog size**: roughly how many products? (Affects whether we need categories/search in the form.)
4. **Area Manager**: is there only one area at launch, or several?

---

## 11. Next Step
Confirm the remaining questions (or accept the defaults: Fonnte, freely editable price, search dropdown, multiple areas supported), then start **Phase 0 + Phase 1 (MVP)**.
