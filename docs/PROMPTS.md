# OPTICOR — Build prompts for Claude Code

How to use:
- One phase = one fresh session (`/clear` between phases). Paste the **Kickoff** once, then each phase prompt in order.
- Each phase prompt starts in **plan mode** (press `Shift+Tab` until "plan mode" shows). Read the plan, correct it, then approve.
- At the end of each phase: everything green (`typecheck`, `lint`, `test`), you clicked through the feature yourself, then commit. Only then go to the next phase.
- If Claude drifts: stop it (`Esc`), point to the exact section of `docs/SPEC.md`, and ask it to fix that only.

---

## Kickoff (paste first, in plan mode)

```
You are building OPTICOR, a multi-store ERP + BI web app for an optician in Morocco.

Read CLAUDE.md, docs/SPEC.md and docs/DESIGN.md completely before anything else.
The UI must match the existing demo at https://opticor.vercel.app (and _reference/opticor-demo/ if it exists),
but the behaviour, data model and permissions come ONLY from docs/SPEC.md — the demo's data layer and
business logic (localStorage, per-order costs, margins, brand/model stock, demo user switcher) are NOT to be reused.

Stack: Next.js App Router (TypeScript strict) + Tailwind + shadcn/ui + next-intl (fr default, en) on Vercel;
Supabase (Postgres, Auth with email invitations, RLS, Storage, Realtime, pg_cron) via @supabase/ssr.
The Supabase MCP server is connected to the DEV project only.

We will build in the phases listed in docs/PROMPTS.md. Do NOT start coding now.
Tasks for this session:
1. Summarise back to me, in 15 bullet points max, your understanding of the product, roles, finance model
   (NET = CA − approved charges) and stock model (by category, from movements).
2. List every ambiguity or contradiction you find between SPEC.md, DESIGN.md and the demo, with your proposed resolution.
3. Wait for my answers. Then update docs/SPEC.md with the resolutions.
```

---

## Phase 1 — Project scaffold & app shell (no data)

```
Phase 1 (plan mode first). Goal: an empty but pixel-faithful app shell.

- Create the Next.js app (App Router, TypeScript strict, src/ dir, ESLint), Tailwind, shadcn/ui, lucide-react,
  next-intl with /fr and /en (fr default), Inter via next/font, light/dark theme with the exact tokens in
  docs/DESIGN.md §1, sonner.
- package.json scripts from CLAUDE.md (dev, build, lint, typecheck, test with Vitest, test:e2e with Playwright,
  db:new, db:push, db:types).
- Build the shell exactly like the demo (DESIGN.md §2): collapsible sidebar with the role-based nav (use a
  hard-coded fake role switch ONLY in development via an env flag, removed in phase 3), top bar (store selector,
  Ctrl K command palette shell, bell, avatar menu with language + theme), mobile bottom bar, page header pattern,
  Access denied page, empty placeholder pages for every route in DESIGN.md §4.
- messages/fr.json and messages/en.json for every string.
Verify: build passes, open the app at desktop and 390px width, compare with the demo screenshots/live demo,
report differences you could not fix. Commit.
```

## Phase 2 — Database schema (migrations + seed)

```
Phase 2 (plan mode first). Goal: the full schema of docs/SPEC.md §5 in Supabase DEV.

- Initialise supabase/ (supabase init, link to the dev project — I'll give you the ref).
- Write migrations in small logical files: enums & helpers, organisation & settings, products & stock,
  clients & orders, purchasing & charges, audit & notifications, views (stock_levels, purchase_balances,
  order display number), indexes on every FK and filter column, the `orders.source` column ('app'|'legacy').
- Enable RLS on every table now with NO policies yet (deny all) — policies come in phase 4.
- seed.sql: product types (frames, contact_lenses, accessories), 5 frame categories (Catégorie A–E with
  placeholder prices), 'Lentilles 1 mois', 'Lentilles 3 mois', list items (lens types: Unifocal, Progressif,
  Double foyer, Mi-distance; treatments: Anti-reflet, Blanc, Bleu (lumière bleue), Photochromique, Durci,
  Teinté, Polarisé; payment methods: Espèces, Carte, Chèque, Virement; charge categories: Loyer, Électricité,
  Eau, Internet, Salaires, Achat fournisseur, Refaire verres, Livraison, Autre; cancel reasons; adjustment
  reasons; vision types: VL, VP, VL+VP), app_settings defaults, role_permissions matrix, charge location 'Général'.
  Seed contains NO stores and NO users.
- Apply with db:push (ask me first), regenerate types, run Supabase advisors through MCP and report.
Verify with MCP list_tables + a few execute_sql checks. Commit.
```

## Phase 3 — Authentication & invitations

```
Phase 3 (plan mode first). Goal: real auth per docs/SPEC.md §4. Remove the dev fake-role switch.

- @supabase/ssr clients (server, browser, admin server-only), session refresh + locale + auth redirects in
  middleware (proxy.ts if Next 16+).
- custom_access_token_hook migration (claims app_role + store_id, nothing for inactive users) and helper SQL
  functions auth_role(), auth_store_id(), is_super_admin(). Tell me exactly what to click to enable the hook.
- Pages: login, forgot-password, set-password, /auth/confirm route (token-hash verifyOtp for invite + recovery).
  Demo sign-in card style, without demo cards.
- Settings › Users: list, invite (Server Action using admin client, zod-validated, super admin only — checked
  server-side), resend invite, change role/store, deactivate. Profiles row created/updated in the same action.
- Role-based nav and route guards (server-side): secretary → only Orders, Clients, Stock, New order,
  Notifications; others → Access denied.
- Give me the Supabase email templates (Invite, Reset password) in FR with the token-hash links.
Verify: invite a test secretary + test super admin on dev, full flow works, a secretary cannot open /dashboard.
Commit.
```

## Phase 4 — RLS policies, RPC functions, triggers + permission tests

```
Phase 4 (plan mode first). Goal: docs/SPEC.md §6 and §7 fully in the database, proven by tests.

- RLS policies for every table exactly as §7 (use (select auth.uid()) style, no recursive policies).
- All RPC functions of §6 (security definer, search_path = '', role/store checks, row locks for stock,
  error codes OPTICOR:*), triggers (prefix lock, charge location auto-create, loyalty, low stock, audit_log,
  supplier payment → charge), storage bucket 'private' with policies for prescriptions/.
- pg_cron jobs: generate_recurring_charges (daily 06:00 Africa/Casablanca = adjust to UTC), notify_stuck_orders.
  Tell me how to enable pg_cron on the project.
- Vitest integration tests against DEV with two seeded test users (secretary of store A, super admin) +
  a store B: secretary cannot read store B orders, cannot read purchases/charges/suppliers/audit_log at all,
  cannot cancel, cannot set discounts, cannot sell with 0 stock, duplicate slip is rejected, delivery blocked
  with balance > 0, cancel restores stock, supplier payment creates exactly one charge, recurring generation is
  idempotent, loyalty fires once at threshold.
- Run advisors via MCP; fix every security finding.
Commit.
```

## Phase 5 — Settings

```
Phase 5 (plan mode first). Goal: Settings pages of docs/SPEC.md §8 with the demo's settings UI.
Lists editor (FR/EN labels, drag sort, archive, usage count), Products (types, categories with sale price,
thresholds per store), Custom fields (built-in measurement fields + custom, visibility hidden/optional/required),
Stores and lab (create/edit, prefix with locked badge once used, deactivate), Charge locations, Loyalty threshold,
Notification thresholds, Roles & permissions (read-only matrix). Server Actions + zod; optimistic UI where simple.
Verify in the browser as super admin; secretary gets Access denied. Commit.
```

## Phase 6 — Clients & Orders (the core)

```
Phase 6 (plan mode first). Goal: Clients + Orders exactly as docs/SPEC.md §8, UI as the demo.
- Clients list (chips, search, sort), client file (stats, vision over time chart, orders across stores with
  secretary restrictions), create/edit client (phone normalisation +212, unique, similar-name warning),
  super admin pending discount.
- New order wizard (3 steps + sticky summary): N° du bon with fixed store prefix, client step with loyal/discount
  banners, measurements with steppers and visibility-driven fields + prescription photo upload to Storage,
  products step with category cards and live stock of the secretary's store, client-own-frame flag, lens type
  + treatments (no prices), total/deposit/method, confirm → create_order; handle DUPLICATE_SLIP and NO_STOCK
  nicely.
- Orders board (drag & drop + Next step), list view, filters, order detail (timeline, payments, history,
  WhatsApp message link in FR, collect balance + deliver, super admin cancel with refund / step back / free
  discount). Global search (Ctrl K) via search_global.
Verify the full secretary flow on desktop and mobile width, then the super admin actions. Playwright test for
"create order → workshop → prepared → in store → collect → delivered". Commit.
```

## Phase 7 — Stock

```
Phase 7 (plan mode first). Goal: Stock page per docs/SPEC.md §8: location tabs (secretary: own store only),
KPI strip without money, product type chips, low-stock filter, quantity pills, movement history drawer,
super admin dialogs: transfer (multi-line), damage (reason required), adjust to counted quantity.
Verify stock numbers always equal the sum of movements and never go negative. Commit.
```

## Phase 8 — Purchasing & suppliers

```
Phase 8 (plan mode first). Goal: Purchasing per docs/SPEC.md §5.4 and §8: suppliers CRUD with balance owed,
new purchase form (receive location, stock lines by category with unit price × qty, lens lines with description
+ amount, live total, initial payment 100/30/50 %/custom/none), purchase detail with payments list and
"Add payment" (≤ remaining). Each supplier payment creates one read-only charge row. Commit.
```

## Phase 9 — Charges

```
Phase 9 (plan mode first). Goal: Charges page per docs/SPEC.md §5.4 and §8: filters, ledger table with source
badges, new/edit charge dialog (required reason, location dropdown from charge_locations, optional order number
lookup), soft delete, audit history per row, pending recurring charges with approve/edit, recurring charges
manager. Sidebar badge = pending count. Commit.
```

## Phase 10 — Workshop

```
Phase 10 (plan mode first). Goal: Workshop page like the demo (summary strip, chips, cards with prescription,
frame category or "Monture du client", lens type + treatments, main action button moving the status),
late highlighting from stuck_order_days. Commit.
```

## Phase 11 — Dashboard

```
Phase 11 (plan mode first). Goal: Dashboard per docs/SPEC.md §9 with the demo's layout and components.
SQL functions for KPIs and time series (period, store, comparison period), period chips + custom range,
store filter, comparison toggle, KPI cards with delta + sparkline (Montant encaissé is the primary card when
period = Today), charts and bottom widgets. Write tests that check each KPI formula on a small fixed dataset
(including the rule that 'Général' charges count only under All stores). Commit.
```

## Phase 12 — Notifications

```
Phase 12 (plan mode first). Goal: notifications per docs/SPEC.md §10: bell with Realtime unread count,
dropdown + /notifications page, mark read, deep links. Verify each notification kind fires once. Commit.
```

## Phase 13 — Hardening & production

```
Phase 13 (plan mode first). Goal: ready for production.
- Run a security review of the whole repo: RLS on all tables, every RPC checks role/store, no service role in
  client bundles, no secrets in code, zod everywhere, error messages don't leak SQL.
- Supabase advisors (security + performance) clean; add missing indexes.
- Loading/empty/error states on every page, mobile pass, accessibility basics (labels, focus, contrast).
- Playwright suite green. Lighthouse on Orders and Dashboard.
- Write docs/DEPLOY.md: how to push migrations to opticor-prod, set Vercel env vars per environment, create the
  first super admin, configure SMTP and email templates, enable the access token hook and pg_cron on prod.
Do not touch production yourself. Commit.
```
