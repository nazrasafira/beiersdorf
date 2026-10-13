# Implementation Plan B — Web backend (Laravel + MySQL)

Run the app on its own server: **Laravel** (PHP) API + **MySQL** database, serving the same pages we already built.
Compared with Plan A (Google Sheets), this is faster, stricter, easier to grow, and keeps all data and code under your control. It needs a small server and someone to look after it.

> Status: plan. No code yet. The front end (pages, design, gamification, shifts, photos) stays as it is.

---

## 1. Goals and limits

| | |
|---|---|
| **Goal** | Production web app for NIVEA SPG reporting, fast (< 300 ms per request), safe, ready to grow past 50 users |
| **Keeps** | All current pages and behaviour; the GitHub Pages demo keeps working in demo mode |
| **Changes** | `data.js` talks to the Laravel API; real login and sessions; real dates; data in MySQL |
| **Later (not in v1)** | Automatic WhatsApp messages via a provider, POS integration, native app |

---

## 2. Architecture

```
 SPG phone / Leader laptop                       Server (VPS or hosting with SSH)
┌──────────────────────────┐   HTTPS (same    ┌──────────────────────────────────┐
│ Pages (HTML/CSS/JS)      │   domain)        │ Nginx → Laravel                   │
│  data.js → /api/...      │ ───────────────▶ │  /           static pages (public)│
│  session cookie          │ ◀─────────────── │  /api/*      JSON API (Sanctum)   │
│  offline sales queue     │                  │  queue + scheduler (cron)         │
└──────────────────────────┘                  │        │                          │
                                              │   MySQL 8      storage/ (photos)  │
                                              └──────────────────────────────────┘
```

- **One domain** (e.g. `laporan-spg.example.co.id`): Laravel serves the existing pages from `public/` and the API under `/api`. Same domain means we can use **secure session cookies** instead of tokens in the browser.
- **Laravel** (current release, PHP 8.3+), **MySQL 8** (or MariaDB 10.6+), **Laravel Sanctum** for login sessions.
- Timezone **Asia/Jakarta** everywhere (`config/app.php` and MySQL).

---

## 3. Database

Money is stored as whole Rupiah (`BIGINT UNSIGNED`). All tables have `created_at` / `updated_at`.

| Table | Columns | Indexes / notes |
|-------|---------|-----------------|
| **users** | `id, phone (unique, 62…), name, role (enum spg/leader/supervisor/admin), area_id, team_id, photo_path, password, must_change_password, active, last_login_at` | `phone` unique; `team_id`, `area_id` |
| **areas** | `id, name, supervisor_id` | |
| **teams** | `id, name, area_id, leader_id` | `area_id` |
| **team_settings** | `team_id (PK), working_days (json, e.g. [1,2,3,4,5,6]), edit_days (default 2), reminder_time` | |
| **holidays** | `id, team_id (null = all teams), date, name, is_working_day` | unique `(team_id, date)` |
| **products** | `id, name, sku (unique, nullable), price, photo_path, active, created_by, updated_by` | shared catalog; never deleted, only deactivated |
| **stores** | `id, name, chain, city, address, area_id, active, created_by, updated_by` | shared list of stores; never deleted, only deactivated |
| **targets** | `id, user_id, month (char 7, '2026-10'), monthly, weekly (null), daily (null), set_by` | unique `(user_id, month)` |
| **shifts** | `id, user_id, date, store_id, started_at, ended_at (null)` | unique `(user_id, date)`; `store_id` = current store |
| **shift_store_visits** | `id, shift_id, store_id, started_at` | one row per start / **switch** of store within a shift |
| **sales** | `id, client_id (uuid, unique), user_id, date, sold_at (datetime), store_id, product_id, qty, price, subtotal, created_by, deleted_at (soft delete)` | `(user_id, date)`, `(date)`, `product_id`; `client_id` makes offline resend safe |
| **day_reports** | `id, user_id, date, no_sales, unlocked_by, unlocked_at` | unique `(user_id, date)`; only for the flags, totals come from `sales` |
| **sessions**, **personal_access_tokens**, **jobs**, **failed_jobs** | standard Laravel | database session driver, so sessions can be revoked per user |
| **activity_log** | `id, user_id, action, subject_type, subject_id, changes (json), ip` | audit of edits, unlocks, target changes, deactivations |

Volume check: 50 SPGs × ~15 sales/day ≈ 22k rows/month ≈ 270k/year. MySQL with the indexes above handles this easily; no archiving needed for years.

---

## 4. Business logic (server side)

Moved from today's `data.js` into Laravel services so every client sees the same numbers:

| Service | Responsibility |
|---------|---------------|
| `WorkingDayService` | is a date a working day for a team (weekdays + holidays) |
| `TargetService` | effective daily / weekly / monthly target (derived from monthly, overrides win) |
| `ProgressService` | actual vs target per SPG / team / area for day, week, month (SQL `SUM` grouped by user and date) |
| `LeaderboardService` | ranking by % of own target, ties by Rupiah; streaks; levels (Pemula → Berlian) |
| `SaleService` | add / remove sale, shift checks, edit-window and unlock rules, idempotency by `client_id` |
| `ReportExport` | CSV / Excel export per team and period (one row per sale) |

Dashboard responses are cached for 60 seconds per team and period, and cleared when a sale in that team changes.

---

## 5. API

All under `/api`, JSON, session cookie + CSRF (Sanctum SPA mode). Validation through Form Requests; permissions through Policies.

| Method & path | Who | Purpose |
|---------------|-----|---------|
| `POST /login`, `POST /logout` | all | phone + password, "ingat saya" 30 days |
| `GET /me`, `POST /me/password`, `POST /me/photo` | all | profile, change password, upload photo |
| `GET /bootstrap` | all | everything a page needs for the user's scope (same shape as today's data) |
| `POST /shifts/start {store_id}`, `POST /shifts/switch-store {store_id}`, `POST /shifts/end` | SPG | today's shift at any active store; switch store mid-shift |
| `GET/POST/PATCH /stores` | admin, supervisor, leader (SPG: read) | store list; edit rules as products |
| `GET /sales?user=&team=&from=&to=` | owner / leader / supervisor | sales list (report details) |
| `POST /sales`, `DELETE /sales/{id}` | SPG (own), leader, supervisor | add / remove a sale |
| `POST /day-reports/{user}/{date}/unlock` / `lock` | leader, supervisor | open a locked day for the SPG |
| `GET /dashboard/team/{team}?period=` | leader, supervisor | summary, trend, ranking, products, missing shifts |
| `GET /dashboard/area/{area}?period=` | supervisor | team comparison, top SPGs |
| `GET/PUT /teams/{team}/targets?month=` | leader, supervisor | read / save targets |
| `GET/PUT /teams/{team}/settings`, `/holidays` | leader, supervisor | working days, edit window, holidays |
| `GET/POST/PATCH /users` (+ `/reset-password`, `/deactivate`) | **SPGs**: leader (own team), supervisor (area). **Leaders & Supervisors**: admin only | manage people |
| `GET/POST/PATCH /products`, `POST /products/{id}/photo`, `POST /products/import`, `GET /products/export` | admin, supervisor, leader (leader edits own only; import/export: admin, supervisor) | catalog, photos, Excel/CSV import & export |
| `GET /reports/export?team=&from=&to=` | leader, supervisor | Excel/CSV download |

---

## 6. Login, sessions and permissions

1. **Login with phone number + password.** Phone is normalised (`08…`, `+62…` → `62…`). Passwords hashed with Laravel's `Hash` (bcrypt/argon2).
2. **Sessions** are httpOnly, Secure, SameSite=Lax cookies stored in the `sessions` table; "Ingat saya" keeps them for 30 days. JavaScript never sees the session, so a script injected into the page can't steal it.
3. **CSRF** protection on every write (Sanctum SPA).
4. **Rate limit**: 5 failed logins per phone + IP per minute, then a short lockout (`RateLimiter`). Every login is written to `activity_log`.
5. **First login / reset**: users get a temporary password and must change it (`must_change_password`). A Team Leader resets their team's SPGs, a Supervisor any SPG in the area; Admin resets Supervisors and Team Leaders.
6. **Deactivate / reset** deletes that user's rows in `sessions`, logging them out on every device immediately.
7. **Roles & scope** (Policies + a `role` middleware):
   - SPG: only own shifts and sales; today needs an open shift, past days only inside the team's edit window or when unlocked.
   - Team Leader: own team's SPGs (add / deactivate / reset), targets, settings, reports; add products and stores, edit the ones they added.
   - Supervisor: all teams in their area.
   - Admin: Supervisor and Team Leader accounts, all products and stores, all data (read).

### Who can do what (agreed)

| Action | SPG | Team Leader | Supervisor | Admin |
|--------|:---:|:-----------:|:----------:|:-----:|
| Add / deactivate / reset **SPGs** | – | own team | any team in area | – |
| Add / deactivate / reset **Team Leaders & Supervisors** | – | – | – | yes |
| Add **products** | – | yes | yes | yes |
| Edit / deactivate **products** | – | the ones they added | any | any |
| Add **stores** | – | yes | yes | yes |
| Edit / deactivate **stores** | – | the ones they added | any | any |
| Start / end shift, choose & switch store, record sales | own | – | – | – |
| Targets, team settings, unlock reports | – | own team | area | – |

Products and stores are **shared lists** for everyone. Every add / edit / deactivate is logged with who did it and when.

8. Optional later: OTP via WhatsApp/SMS provider for login or password reset.

---

## 7. Photos

- Client already resizes photos (profile 192 px, product 320 px). Server re-encodes them (Intervention Image) to strip metadata and enforce size (max 1 MB, JPEG/PNG/WebP).
- Stored on the `public` disk (`storage/app/public/photos/...`), served as static files. Can move to S3-compatible storage (e.g. IDCloudHost Object Storage) by changing the disk config.
- Demo portraits and product illustrations stay as defaults until a real photo is uploaded.

---

## 8. Products and stores

Products and stores are shared lists managed by Admin, Supervisors and Team Leaders (rules in section 6). Every sale stores the store of the shift at that moment, so reports, rankings and exports can be filtered and grouped **by store**. Targets stay per SPG.

### 8.1 Products: Excel instead of editing the Sheet

The Sheets plan lets Admin edit products in the spreadsheet. Here the equivalent is:
- **Export** the catalog to Excel, edit it, **import** it back (matched by SKU; new rows created, prices/active updated, nothing deleted). Uses `maatwebsite/excel`.
- Import shows a preview with errors per row before saving.
- Plus the existing in-app add/edit pop-up.

---

## 9. Front-end changes

Shared with the Sheets plan, so the work is done once:

1. `assets/js/config.js`: `BACKEND = 'demo' | 'sheets' | 'laravel'`. GitHub Pages stays `demo`.
2. `data.js` keeps its in-memory state; `await Data.ready()` loads `/api/bootstrap`. Read functions stay synchronous. Write functions become `async`, call the API, and roll back with a message on error.
3. Dashboards use `/api/dashboard/...` (server computes), so big areas stay fast.
4. Report details and exports call the API on demand.
5. Login page: phone + password, "Ingat saya", change-password screen; demo accounts hidden outside demo mode.
6. Offline queue for sales (same as Plan A), sent with `client_id`; loading states and error toasts.
7. **Store at shift start**: "Mulai shift" opens a searchable store list (any active store, last used pre-selected); the Penjualan page shows the current store with "Ganti toko". New **Toko** page for Leader/Supervisor/Admin; product pages for Leader/Supervisor; Admin's user page adds Supervisors and Team Leaders, Leader/Supervisor pages add SPGs only. Reports and exports gain a store column and filter.
8. Leader dashboard refreshes every 60 s while open (live enough; real-time push with Laravel Reverb is possible later).

---

## 10. Repository layout

The current static site stays at the repo root (GitHub Pages demo). The Laravel app lives next to it:

```
/                    → current pages (demo on GitHub Pages)
server/              → Laravel project
  app/Models, app/Http/Controllers/Api, app/Policies, app/Services
  database/migrations, database/seeders (DemoSeeder = today's demo data)
  routes/api.php
  tests/Feature      → API + permission tests per role
  deploy/sync-frontend.sh → copies the root pages into server/public on deploy
```

---

## 11. Hosting and operations

| Option | Cost (approx.) | Notes |
|--------|----------------|-------|
| **VPS in Indonesia** (e.g. IDCloudHost, Biznet Gio, DewaWeb) 2 vCPU / 2–4 GB | Rp 100–250k / month | **Recommended.** Data stays in Indonesia; full control |
| Shared hosting with SSH + PHP 8.3 (e.g. Niagahoster/Hostinger) | Rp 30–100k / month | Cheapest; queue/cron more limited |
| VPS + Laravel Forge or Ploi (server management service) | + ~US$10–15 / month | Easier deploys and updates if nobody wants to manage Linux |

Prices are rough; confirm with the provider at purchase time.

Operations:
- HTTPS with Let's Encrypt; domain or subdomain from the client.
- `cron` running `php artisan schedule:run` every minute:
  - 20:00 reminder list for Leaders (who hasn't started a shift / no sales) — shown in the app; WhatsApp sending later.
  - nightly database + photo backup (`spatie/laravel-backup`) to off-server storage, 30 days kept.
- Queue worker (Supervisor/systemd) for exports and image processing.
- Error tracking/log alerts (e.g. Laravel log to email or Sentry free tier).
- Deploys: `git pull` → `composer install --no-dev` → `php artisan migrate --force` → `sync-frontend.sh` → `php artisan optimize`, or via Forge/Ploi.

---

## 12. Phases

| Phase | Work | Result |
|-------|------|--------|
| **1. Foundation** | Laravel project, migrations, models, DemoSeeder, auth (phone login, sessions, rate limit, change password), roles & policies | Log in against MySQL |
| **2. Front-end adapter** | `config.js`, async `data.js` with `bootstrap`, loading/error states | Current pages run on the API |
| **3. SPG flow** | shifts, sales add/remove, edit window & unlock rules, idempotency, offline queue | Full shift on real data |
| **4. Dashboards & reports** | services, team/area dashboards, rankings, streaks, trend, exports | Leaders and Supervisor live |
| **5. Management** | users (by role), stores, targets, settings/holidays, products + Excel import/export, photos | Admin and Leaders self-sufficient |
| **6. Ops & hardening** | server setup, HTTPS, backups, scheduler, logs, activity log, load test | Ready for pilot |
| **7. Pilot** | 1 team for 1–2 weeks, fixes, then all teams | Go-live |

---

## 13. Testing

- **Feature tests** (PHPUnit/Pest) for every endpoint × role: allowed and forbidden cases, edit-window rules, idempotent sales, target derivation, holiday handling, rankings.
- **Existing Playwright tests** run against a local Laravel server seeded with `DemoSeeder` (same data as the demo, so expected numbers stay the same).
- **Load check**: 50 users posting sales at once, dashboard response times.
- **Manual pilot checklist**: two phones at once, airplane mode during a shift, deactivate while logged in, password reset, Excel import with mistakes.

---

## 14. Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Backend | **Laravel + MySQL** |
| 2 | Login | **Phone number + password** |
| 3 | Photos | Stored on the server (`public` disk), can move to object storage |
| 4 | Product bulk edits | Excel export / import (replaces editing in the Sheet) |
| 4a | Who adds users | Admin: Supervisors & Team Leaders. Supervisors & Team Leaders: SPGs only |
| 4b | Products | Admin, Supervisors and Team Leaders (Leader edits own; Supervisor/Admin edit any) |
| 4c | Stores | Shared list managed by Admin, Supervisors and Team Leaders (same edit rules) |
| 4d | Store per shift | SPG picks **any** store when starting a shift and **can switch** during the shift |
| 4e | Targets | Stay **per SPG** (not per store) |
| 5 | Hosting | **Open** (recommended: VPS in Indonesia) |
| 6 | Data must stay in Indonesia (UU PDP / NIVEA IT policy)? | **Open** |
| 7 | Who maintains the server after launch | **Open** |
| 8 | Offline sales queue from day one | **Open** (recommended: yes) |
| 9 | Domain / subdomain | **Open** |
| 10 | Do we still pilot on Google Sheets first, or go straight to Laravel? | **Open** |
