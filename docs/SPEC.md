# OPTICOR — Product & Architecture Spec

> Source of truth for behaviour, data model and permissions.
> UI look & feel lives in `docs/DESIGN.md`. If code and this file disagree, this file wins — or update it in the same PR.

---

## 1. What we are building

A multi-store ERP + BI web app for one optician business in Morocco:

- **N stores ("succursales")** + **1 lab** (stock location, where glasses are prepared).
- Two roles: **super_admin** (the optician, sees everything) and **secretary** (front desk, one store).
- Replaces a paper order slip ("bon") per client. The paper slip number stays the reference.
- Cash-based finance model: **NET = CA − approved charges**. No per-order margin, no cost of goods.
- Languages: **French (default) + English**. Currency: **DH (MAD)**. Time zone: **Africa/Casablanca**.

Out of scope for v1: PDF/Excel export, invoices, per-order costs/margin, custom roles UI, Excel history import (planned later — keep schema compatible).

---

## 2. Stack (fixed decisions)

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (same major as the demo, App Router, TypeScript strict), Tailwind CSS, shadcn/ui, lucide-react, Recharts, next-intl (`/fr`, `/en`), react-hook-form + zod, sonner, @dnd-kit (orders board) |
| Backend | Supabase: Postgres, Auth (email invitations), Storage (private), Realtime (notifications), pg_cron (scheduled jobs) |
| Data access | `@supabase/ssr` (server + browser clients), Server Components for reads, Server Actions for writes, **all multi-step writes = Postgres functions called with `supabase.rpc()`** |
| Types | `supabase gen types typescript` → `src/types/database.ts` (never hand-edit) |
| Hosting | Vercel. Preview deployments → **opticor-dev** Supabase project. Production → **opticor-prod** project |
| Tests | Vitest (pure logic + RLS integration tests against dev project with test users), Playwright (critical flows) |

Rules:
- `SUPABASE_SERVICE_ROLE_KEY` is used **only** in server code for admin actions (inviting users). Never in the browser, never `NEXT_PUBLIC_`.
- Security is enforced in the database (RLS + checks inside functions). Hiding things in the UI is cosmetic only.
- Money: `numeric(12,2)` in DH. Never JS floats for sums — sum in SQL.
- Dates: `timestamptz` everywhere. "Business day" = date in `Africa/Casablanca` (`(ts at time zone 'Africa/Casablanca')::date`).
- Phones: stored normalized E.164 (`+2126XXXXXXXX`), displayed `06 XX XX XX XX`.

---

## 3. Roles & permissions

| Capability | secretary | super_admin |
|---|---|---|
| Pages | Orders, Clients, Stock (+ New order, Notifications) | All pages |
| Scope | Own store only (orders, stock). Clients are shared (read all, create) | All stores + lab |
| Create order, add payment, move status, deliver | ✅ own store | ✅ |
| Cancel order | ❌ | ✅ |
| See frame **sale** price | ✅ | ✅ |
| See any cost, purchase, supplier, charge | ❌ never | ✅ |
| Apply a pre-approved client discount | ✅ | ✅ |
| Set a client discount / free discount on order | ❌ | ✅ |
| Stock: transfers, damage, adjustments | ❌ (read only, own store, quantities only) | ✅ |
| Settings, users, dashboard, workshop, purchasing, charges | ❌ | ✅ |

- Permissions are stored in table `role_permissions(role, permission)` seeded with the matrix above. v1 has **no UI** to edit roles; the table exists so custom roles can be added later.
- Secretary visiting a forbidden route sees the **Access denied** page (see DESIGN.md).
- A secretary account belongs to exactly **one** store. Deactivated users cannot sign in.

---

## 4. Authentication

- **No public sign-up** (disable in Supabase Auth settings).
- **Invitation by email only.** Super admin → Settings › Users → "Invite": full name, email, role, store (required for secretary).
  - Server Action (service role) calls `auth.admin.inviteUserByEmail(email, { data: { full_name, role, store_id }, redirectTo: SITE_URL + '/auth/confirm?next=/set-password' })` and upserts `profiles`.
  - Invite email template uses the SSR token-hash flow:
    `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/set-password` (the confirm route adds the user's locale)
  - `/auth/confirm` route verifies the OTP (`verifyOtp`), then redirects to set-password; user chooses a password; then lands on their home (secretary → Orders, super admin → Dashboard).
- Sign-in: email + password. "Forgot password" → reset email (same token-hash pattern, `type=recovery`). Both are rate-limited by the app (per email and per IP), and choosing a password needs a session opened by the invite / reset link within the hour — see §11 "Security review 2".
- Custom SMTP is required for real emails (e.g. Resend) — Supabase's built-in mailer is for testing only.
- **Custom Access Token Hook** (`public.custom_access_token_hook`) adds claims `app_role` and `store_id` from `profiles` to the JWT. RLS reads them via helpers:
  - `public.auth_role() returns text` → `auth.jwt() ->> 'app_role'`
  - `public.auth_store_id() returns uuid` → `(auth.jwt() ->> 'store_id')::uuid`
  - `public.is_super_admin() returns boolean`
  - Also check `profiles.is_active` in the hook (inactive → no role claim → everything denied).
  - **Live check** (decided in phase 3): `auth_role()` / `auth_store_id()` return the claim only while it still matches an active `profiles` row (security definer, one PK lookup per statement). Deactivating a user or changing role/store takes effect immediately, not at the next token refresh. The app applies the same rule (`claimsMatchProfile` in `getSessionUser`): a token whose `app_role` / `store_id` no longer match the profile is treated as signed out and the user lands on the login page with "session expired" — never on empty pages (decided 2026-11-03).
- Settings › Users (phase 3): invite = Server Action (service role) → `inviteUserByEmail` + `profiles` insert (auth user deleted if the insert fails). Role / store / active changes go through `admin_update_user_access` (super admin only, never on oneself, never removes the last active super admin; revokes the user's sessions); deactivation also bans the user in Auth. The list comes from `admin_list_users()` (status Active / Invited / Disabled from `auth.users`).
- `/auth/confirm` accepts `type` = `invite` | `recovery` and `next` from an allow-list (`/set-password`); it redirects to `/{profiles.locale}{next}`. Templates and dashboard steps: `docs/DEPLOY.md` §3.
- Session refresh in `src/proxy.ts` (Next.js 16 name for middleware) using `@supabase/ssr`; also handles locale routing (next-intl) and redirects unauthenticated users to `/{locale}/login`.
- First super admin: bootstrap documented in `docs/DEPLOY.md` §5 (invite from Supabase dashboard, then one SQL insert of the profile).

---

## 5. Data model

All tables: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`, `created_by uuid references profiles(id)` where relevant. RLS enabled on **every** table.

### 5.1 Organisation & settings

```
stores
  id, name, kind ('store' | 'lab'), prefix text (e.g. 'CNT', unique, ^[A-Z]{2,5}$),
  address, phone, is_active bool default true, created_at
  -- prefix is immutable once the store has at least one order (trigger)
  -- deactivate, never delete

profiles                      -- 1:1 with auth.users
  id (= auth.users.id), full_name, email, role ('super_admin' | 'secretary'),
  store_id uuid null references stores (required when role = 'secretary'; must be a kind = 'store' row, never the lab — checked in the invite action and by trigger),
  is_active bool default true, locale ('fr' | 'en') default 'fr', created_at

role_permissions (role text, permission text, primary key(role, permission))

app_settings (key text primary key, value jsonb)
  -- 'loyalty_threshold'      → { "orders": 5 }
  -- 'stuck_order_days'       → { "confirmed": 3, "in_workshop": 5, "prepared": 3, "in_store": 10 }
  -- 'slip_number_padding'    → { "digits": 5 }

settings_list_items           -- every editable dropdown
  id, list_key text, code text null (unique per list_key; stable key, e.g. 'supplier_purchase'),
  label_fr, label_en, sort int, is_archived bool, meta jsonb
  list_key ∈ 'lens_types' | 'treatments' | 'payment_methods' | 'charge_categories'
           | 'cancel_reasons' | 'adjustment_reasons' | 'vision_types'
  -- archived items stay referenced by old rows; hidden from new choices
  -- show "used in N orders" count in the UI

custom_fields
  id, key, label_fr, label_en, field_type ('text'|'number'|'select'|'date'),
  options jsonb, visibility ('hidden'|'optional'|'required'), applies_to ('order'), is_builtin bool, sort
  -- built-in measurement fields are ALSO controlled here by visibility (seeded, is_builtin = true):
  -- ep_re, ep_le, fitting_height, vision_type, doctor_name, prescription_date, prescription_photo

charge_locations              -- dropdown on charges, editable by super admin
  id, label_fr, label_en, store_id uuid null references stores, is_general bool, is_archived, sort
  -- seed: one row per store/lab (auto-created by trigger when a store is created) + 'Général'
```

### 5.2 Products & stock (by **category**, never by model name)

```
product_types
  id, key ('frames' | 'contact_lenses' | 'accessories'), label_fr, label_en,
  is_frame bool, sort, is_archived
  -- lenses (verres) are NOT a product type: never stocked

product_categories
  id, product_type_id, name (e.g. 'Catégorie A'), sale_price numeric(12,2),
  sort, is_archived
  -- super admin can add categories at any time
  -- changing sale_price affects only NEW orders (orders snapshot the price)

category_thresholds (store_id, category_id, low_stock_min int default 0, primary key(store_id, category_id))
  -- no row = no low-stock alert and a neutral quantity pill

stock_movements                       -- the only source of stock quantities
  id, store_id, category_id, qty_delta int (≠ 0),
  kind ('purchase' | 'sale' | 'sale_cancel' | 'transfer_out' | 'transfer_in' | 'damage' | 'adjustment'),
  ref_table text null, ref_id uuid null, reason text null,
  reason_id uuid null (settings_list_items 'adjustment_reasons'), created_by, created_at
  -- CHECK: sign matches kind (purchase / sale_cancel / transfer_in > 0; sale / transfer_out / damage < 0)

view stock_levels (store_id, category_id, quantity = sum(qty_delta))
  -- invariant: quantity never < 0 (enforced inside every RPC that removes stock, with row locks)

transfers       id, from_store_id, to_store_id, note, created_by, created_at
transfer_lines  id, transfer_id, category_id, qty int > 0
  -- one-step: on create, stock leaves source and arrives at destination immediately
```

### 5.3 Clients & orders

```
clients
  id, full_name, phone_e164 text UNIQUE NOT NULL, has_whatsapp bool default true,
  first_store_id, notes,
  is_loyal bool default false, loyal_since timestamptz null,
  pending_discount_type ('percent' | 'amount') null, pending_discount_value numeric null,
  pending_discount_note text null, pending_discount_set_by uuid null,
  created_at, created_by
  -- on create: warn if a similar name exists (trigram similarity); phone must be unique

orders
  id uuid,
  store_id (kind must be 'store'), client_id,
  booklet text not null default '',          -- '' normally; 'B','C'… only if a booklet restarts
  slip_number int not null check (> 0),      -- number printed on the paper slip, typed by secretary
  UNIQUE (store_id, booklet, slip_number),
  status ('confirmed' | 'in_workshop' | 'prepared' | 'in_store' | 'delivered' | 'cancelled'),
  -- prescription
  re_sph, re_cyl, re_add, le_sph, le_cyl, le_add  numeric(5,2) null  (steps of 0.25, -30..+30)
  re_axis, le_axis int null check (0..180)      -- required when cyl ≠ 0, else null
  ep_re, ep_le, fitting_height numeric(4,1) null
  vision_type_id null, doctor_name null, prescription_date date null, prescription_photo_path null,
  custom_values jsonb default '{}',
  -- lenses (instructions only, no price)
  lens_type_id null, lens_details text null,
  -- money
  subtotal numeric(12,2),        -- what the secretary typed as total before discount
  discount_amount numeric(12,2) default 0,
  discount_source ('none' | 'client_pending' | 'admin_free') default 'none',
  total numeric(12,2),           -- GENERATED = subtotal − discount_amount  (CA uses this)
  frame_revenue numeric(12,2),   -- snapshot of frame/product items sum
  lens_revenue numeric(12,2),    -- GENERATED = total − frame_revenue, CHECK ≥ 0
  source ('app' | 'legacy') default 'app',   -- see §12
  client_own_frame bool default false,   -- when true: no frame-type order_item allowed; frame_revenue = other items only
  -- lifecycle
  cancelled_at, cancelled_by, cancel_reason_id, cancel_note,
  delivered_at, created_by, created_at

display number (computed in a view / helper, not stored):
  prefix || '-' || (booklet || '-' if booklet ≠ '') || lpad(slip_number, padding, '0')
  → 'CNT-00832', 'CNT-B-00001'
  -- helper format_order_number(prefix, booklet, slip, digits) + view order_numbers(order_id, store_id, display_number)

view order_balances (order_id, store_id, status, total, paid, balance = total − sum(payments))

order_items                    -- frame (max 1 item of a frame type), contact lenses, accessories
  id, order_id, category_id, qty int > 0, unit_price numeric(12,2)   -- price snapshot

order_treatments (order_id, treatment_id, primary key(order_id, treatment_id))

order_status_history  id, order_id, from_status, to_status, changed_by, changed_at

payments
  id, order_id, amount numeric(12,2) ≠ 0 (negative = refund), method_id,
  kind ('deposit' | 'balance' | 'refund'), received_at default now(), received_by
```

### 5.4 Purchasing, suppliers, charges

```
suppliers      id, name, phone, note, is_archived

purchases
  id, supplier_id, receive_store_id (store or lab), supplier_ref text null,
  purchase_date date, note, created_by, created_at
  -- saving a purchase = goods received: stock movements created immediately for stock lines
  -- (no draft/ordered statuses in v1)

purchase_lines
  id, purchase_id,
  line_kind ('stock' | 'lens'),
  category_id null (required for 'stock'), description text null (required for 'lens'),
  unit_price numeric(12,2), qty int > 0, line_total generated always as (unit_price * qty) stored

view purchase_balances (purchase_id, supplier_id, total, paid, remaining)

supplier_payments
  id, purchase_id, amount numeric(12,2) > 0, paid_at date, method_id, note, created_by
  -- cannot exceed remaining balance
  -- trigger: each insert creates exactly one charges row (status 'approved', category 'Achat fournisseur',
  --   location = charge_location of purchase.receive_store_id, supplier_payment_id set)
  -- that charge row is read-only on the Charges page (edit via the purchase)

charges
  id, amount numeric(12,2) > 0, charge_date date,
  category_id (settings_list_items 'charge_categories'), location_id (charge_locations),
  reason text NOT NULL, order_id uuid null,         -- optional link "CNT-00832", not used in KPIs
  status ('approved' | 'pending') default 'approved',
  approved_by, approved_at,
  supplier_payment_id uuid null UNIQUE, recurring_charge_id uuid null,
  is_deleted bool default false, deleted_by, deleted_at,   -- soft delete only
  created_by, created_at, updated_at

recurring_charges
  id, label, amount, category_id, location_id, day_of_month int (1..28), is_active, created_by
  -- pg_cron daily: on day_of_month, insert a charges row with status 'pending' (once per month, idempotent)
  -- only APPROVED charges count in NET; super admin approves (can edit amount before approving)
```

### 5.5 Cross-cutting

```
audit_log  id, table_name, row_id, action ('insert'|'update'|'delete'), old jsonb, new jsonb, actor, at
  -- triggers on: orders, payments, charges, purchases, purchase_lines, supplier_payments,
  --              stock_movements, product_categories (price changes), clients (discount fields)

notifications
  id, user_id (recipient), kind, title_key, params jsonb, link text,
  dedupe_key text null (unique per user_id — makes "notify once" idempotent), read_at null, created_at
  -- fan-out at insert time to the right users (helper notify_super_admins(), notify_store(store_id))
  -- Realtime subscription on the user's own rows

storage bucket 'private' (no public access):
  prescriptions/{order_id}/...   -- read: super admin + secretaries of that order's store
```

---

## 6. Business rules & Postgres functions (RPC)

All are `security definer`, `set search_path = ''`, check `auth_role()` / `auth_store_id()` themselves, run in one transaction, and raise errors with stable codes (`OPTICOR:DUPLICATE_SLIP`, `OPTICOR:NO_STOCK`, …) that the UI maps to translated messages.

| Function | Who | What it does |
|---|---|---|
| `create_order(payload jsonb)` | secretary (own store), super admin | Validates prescription, slip number uniqueness, stock ≥ qty for each item (lock rows), total ≥ frame_revenue, discount rules; inserts order, items, treatments, first payment (deposit, may be 0), stock movements (`sale`), status history; returns `{ order_id, display_number }`. On duplicate slip: returns `{ error: 'DUPLICATE_SLIP', existing: {display, client, date} }` **and** notifies super admins (do not raise, so the notification is kept). |
| `change_order_status(order_id, to_status)` | secretary (own store), super admin | Allowed moves: forward one step, or back one step (super admin only; down to `confirmed`, never *from* `delivered`). `delivered` only if balance = 0. Writes history. Triggers loyalty check on delivered. |
| `add_payment(order_id, amount, method_id)` | both | amount > 0 and ≤ balance. |
| `deliver_order(order_id, final_payment jsonb null)` | both | Optional final payment + status delivered in one transaction. |
| `cancel_order(order_id, reason_id, note, refund_amount, refund_method_id)` | super admin | Allowed from any status except `cancelled` (delivered included). Status cancelled, `sale_cancel` stock movements (frame/items back), optional refund as negative payment (≤ paid). Never delete. |
| `set_client_discount(client_id, type, value, note)` / `clear_client_discount` | super admin | Pre-approve a discount for the client's next order. Consumed (cleared) by `create_order` when applied (percent = % of the typed total). |
| `apply_free_discount(order_id, amount)` | super admin | Before delivery; amount ≤ balance; never brings `total` below `frame_revenue`; not on top of a client discount. |
| `create_purchase(payload)` | super admin | Purchase + lines + `purchase` stock movements at receive location + optional initial supplier payment (100% / 30% / 50% / custom). |
| `add_supplier_payment(purchase_id, amount, paid_at, method_id)` | super admin | ≤ remaining; trigger creates the charge row. |
| `create_transfer(from, to, lines)` | super admin | Checks stock at source; `transfer_out` / `transfer_in` movements. |
| `record_damage(store_id, category_id, qty, reason)` | super admin | reason required; `damage` movement; no charge. |
| `adjust_stock(store_id, category_id, counted_qty, reason_id, note)` | super admin | Movement of (counted − current) kind `adjustment`. |
| `approve_charge(charge_id, amount null)` | super admin | pending → approved (optionally fix amount). |
| `generate_recurring_charges(p_date)` | pg_cron (daily 05:00 UTC = 06:00 Casablanca) | Every active recurring charge whose `day_of_month` ≤ today gets one pending charge for the month: idempotent per (recurring_charge_id, month) and catches up missed days. Callable by `service_role` only. |
| `notify_stuck_orders()` | pg_cron (daily 07:00 UTC), `service_role` only | Orders in a status longer than `stuck_order_days` → notify super admins + that store (once per order+status). |
| `search_global(q text)` | both | Clients (name / phone) + orders (display number in any form: `832`, `00832`, `cnt-832`, `CNT-00832`) respecting RLS scope. |

Triggers:
- `stores`: block prefix change if orders exist; auto-create `charge_locations` row on insert.
- Loyalty: after an order becomes `delivered`, count the client's delivered orders across **all stores**; when it reaches `loyalty_threshold` and `is_loyal = false` → set `is_loyal`, `loyal_since`, notify super admins + secretaries of that order's store (once).
- Low stock: after a stock movement, if the level crosses **down** to ≤ `low_stock_min` → notify super admins + that store.
- Audit triggers (5.5).

---

## 7. Row Level Security (summary)

- Default deny. Every table has RLS on; `anon` gets nothing.
- `super_admin`: full access on all tables (still through RPCs for multi-step writes).
- `secretary`:
  - `stores`: select active stores (names/prefix only).
  - `profiles`: select own row.
  - `clients`: select all, insert, update contact fields (not discount fields — column privileges or RPC).
  - `orders`, `order_items`, `order_treatments`, `order_status_history`, `payments`: select where `store_id = auth_store_id()` (via join for child tables). Writes only through RPCs.
  - `product_types`, `product_categories`, `settings_list_items`, `custom_fields`, `app_settings` (non-sensitive keys): select.
  - `stock_levels` / `stock_movements`: select own store only.
  - `notifications`: select/update own rows.
  - **No access at all**: `suppliers`, `purchases`, `purchase_lines`, `supplier_payments`, `charges`, `recurring_charges`, `charge_locations`, `audit_log`, `transfers`, `category_thresholds` (write).
- **Ledger tables are RPC-only, also for the super admin** (decided in phase 4): `orders`, `order_items`, `order_treatments`, `order_status_history`, `payments`, `stock_movements`, `transfers`, `transfer_lines`, `purchases`, `purchase_lines`, `supplier_payments`, `audit_log` have select policies only. The super admin writes configuration tables directly (stores, products, lists, custom fields, settings, thresholds, suppliers, charge locations, charges, recurring charges); charges are never hard-deleted.
- Clients: column grants — `authenticated` may insert/update only `full_name, phone_e164, has_whatsapp, notes`; discount fields via `set/clear_client_discount`, loyalty via trigger. Notifications: update of `read_at` only. `anon` has no table privileges.
- Storage `private/prescriptions/{order_id}/…`: read + upload when the caller can see that order (orders RLS), delete super admin only.
- Use `(select auth.uid())` / `(select public.auth_store_id())` pattern in policies for performance; index every `store_id`, `client_id`, `order_id` foreign key.
- After each migration: run Supabase **security + performance advisors** (MCP `get_advisors`) and fix findings.

---

## 8. Pages (what changes vs the demo UI)

Keep the demo's look, layout and interactions (see DESIGN.md). Behaviour changes:

**Shell**: remove DEMO switcher / Reset demo / Settings › Demo. Top bar: store selector (super admin: All stores / each store / lab, persisted in a cookie; it filters Orders, Workshop, the Stock tab and is the default Dashboard store filter; secretary: fixed pill with her store), global search (Ctrl K → `search_global`), notifications bell (Realtime), avatar menu (language FR/EN, theme, sign out).

**Orders** (both roles) — keep as in demo: Board (5 columns + drag & drop + "Next step" button) / List, search, "Balance due > 0", "Show cancelled". Card shows display number `CNT-00832`.

**New order** (3 steps, sticky summary on the right):
1. *Client*: store (secretary: fixed), **"N° du bon" (required, integer, shows the prefix before the input: `CNT-` [00832])**, existing client search (name/phone) or new client (name, phone required + unique, WhatsApp toggle). Loyal client → yellow banner; pending discount → banner "Remise approuvée : 10 %" with "Appliquer".
2. *Measurements*: SPH/CYL/AXIS/ADD per eye with ±0.25 steppers, Copy RE → LE, "Reuse last measurements", then built-in + custom fields according to visibility.
3. *Products & payment*: product type tabs from `product_types`. **Frames: grid of category cards** (name, sale price, "N in stock" in this store; disabled when 0 with tooltip "0 en stock — demander un transfert"). Toggle "Monture du client" (flag shown on the order everywhere). Contact lenses / accessories: category + qty. Lens type (single select) + treatments (multi chips) + lens details (free text) — **no lens prices**. Payment: "Total" typed by secretary (must be ≥ frame/items price), discount line if applied, deposit with 30 / 50 / 100 % chips, payment method, balance due. Confirm → `create_order`.

**Order detail**: keep demo layout (timeline, prescription, products, client card, payments, additional info, history). **Remove the "Costs and margin" panel.** Super admin extra actions in "…" menu: cancel (dialog with reason + refund), move back one step, free discount (before delivery only).

**Secretary → admin on WhatsApp** (2026-11-13): when a secretary confirms a new order (wizard success) or moves an order to *En succursale* (board, order page), a prompt offers "Prévenir {admin} sur WhatsApp" for each active super admin with a WhatsApp number; it opens `wa.me` with the message ready (number, client, store, total/deposit or balance due) and she taps Send. "Plus tard" skips it; a "Prévenir l'admin" button stays on the order page while the order is *Confirmée* or *En succursale*. Nothing is sent automatically. Super admins never get the prompt.

**Clients**: list with chips All / New / Regular / Loyal (counts = non-cancelled orders across all stores; Loyal = `is_loyal`; New = 0–1 order; Regular = 2..N−1), client file (orders across stores: secretary sees count — via `client_order_stats(client_id)` security definer RPC returning counts only — + only her store's rows), "Vision over time" chart, "New order for this client". Super admin: set/clear pending discount.

**Stock**: location tabs (secretary: only her store, no tabs), KPI strip (tracked categories, items in stock, below threshold — **no money value**), search + product type chips + "Low stock only", table: category, type, quantity pill (red < min, amber = min), threshold (super admin edits it inline). Row click / history icon opens the movement history drawer for **both roles** (secretary: her store; kind, ±qty, level after, date, user, order N°). Super admin row actions: adjust (count), damage, transfer; header button "Transfers" (history + new transfer).

**Workshop** (super admin): same as demo (summary strip, filter chips, cards with prescription + main action). Shows frame category or "Monture du client", lens type + treatments.

**Purchasing** (super admin): tabs *Purchases* / *Suppliers*. New purchase: supplier, "Reçu à" (store/lab), date, supplier ref, lines (stock: category + unit price + qty → line total; lens: description + amount), total auto; payment now: 100 % / 30 % / 50 % / custom / nothing. Table columns: date, supplier, received at, total, paid, remaining (badge), actions (add payment, view). Suppliers tab: CRUD + balance owed per supplier.

**Charges** (super admin, replaces demo "Expenses"): filters (period, location, category, status), table (date, category, location, reason, amount, order link, source badge: manual / supplier payment / recurring, status), "New charge" dialog (amount, date, category, location, required reason, optional order number lookup), pending recurring charges section with Approve / Edit amount, recurring charges manager (label, amount, category, location, day of month, active). Supplier-payment rows are read-only with a link to the purchase. Edit = logged; delete = soft delete.

**Dashboard** (super admin): filters — period chips (Today, 7 days, This month, Last month, This year, Custom), store filter, comparison (vs M−1 / vs Y−1 / None). See §9 for KPIs. Remove gross/net margin cards of the demo, "Orders without costs" and stock value; replace with the KPIs below.

**Settings** (super admin): sub-nav
- *Lists* (all `settings_list_items` lists, FR/EN labels, drag to sort, archive, usage count)
- *Products* (product types + categories: name, sale price, archive; thresholds per store)
- *Custom fields* (built-in measurement fields + custom ones, visibility hidden/optional/required)
- *Stores and lab* (create, edit, prefix — locked badge once used, deactivate)
- *Users* (invite, role, store, deactivate, resend invite; WhatsApp number of each super admin, used by the secretary → admin prompt)
- *Charge locations* (labels, archive)
- *Loyalty* (number of delivered orders)
- *Notifications* (stuck-order days per status)
- *Roles and permissions* (read-only matrix in v1)

---

## 9. KPIs (all respect period + store filters; comparison uses the same formula on the comparison period)

| KPI | Formula |
|---|---|
| CA (Chiffre d'affaires) | `sum(orders.total)` where `status ≠ 'cancelled'` and business date of `created_at` in period |
| Montant encaissé | `sum(payments.amount)` by business date of `received_at` (refunds negative). Shown for every period; **primary card when period = Today** |
| Charges | `sum(charges.amount)` where `status = 'approved'` and `is_deleted = false` and `charge_date` in period. Store filter: charges whose location belongs to that store; **'Général' and non-store locations only under "All stores"** (lab charges also when the lab is selected) |
| NET | CA − Charges |
| Orders | count non-cancelled orders |
| Average basket | CA / Orders |
| Balance to collect | sum of remaining balance of non-cancelled, non-delivered orders created in period |
| Owed to suppliers | sum of `purchase_balances.remaining` (all time, as of today) |
| Discounts given | `sum(discount_amount)` |
| Cancellation rate | cancelled / all orders created in period |
| Damaged frames | `−sum(qty_delta)` of `damage` movements (count, not money) |
| Sales by frame category / treatment / lens type | counts + CA share (frame_revenue for categories) |
| Stock | quantities per category per location + low-stock list |
| Loyal clients / repeat rate | loyal count; % of clients served in period with ≥ 2 delivered orders |
| Workshop time | avg days confirmed → in_store, and confirmed → delivered |
| Pending recurring charges | count + amount awaiting approval (dashboard widget with link) |

Charts (reuse demo components): CA over time vs comparison, CA & NET by store (bar + table), client segments, top categories/treatments, busiest hours heatmap, workshop lead times. Bottom widgets: glasses waiting for pick-up, pending charges, low stock.

Implement KPIs as SQL functions (`kpi_summary(from, to, store_id)`, `kpi_timeseries(...)`, …) returning JSON; heavy ones may use materialized views refreshed by pg_cron. Never compute money totals in JS.

---

## 10. Notifications (Realtime)

| Kind | Recipients |
|---|---|
| `client_became_loyal` | super admins + secretaries of the order's store |
| `low_stock` | super admins + secretaries of that store |
| `order_stuck` | super admins + secretaries of that store |
| `duplicate_slip_blocked` | super admins |
| `recurring_charges_pending` | super admins |

Bell shows unread count; list page `/notifications`; clicking marks read and navigates to `link`.

Also `clients_became_loyal` (super admins): summary sent when a new loyalty threshold makes existing clients loyal (phase 5).

---

## 11. Decisions log (kickoff, 2026-11-03)

- **Discount vs frame price**: a discount may never bring `total` below `frame_revenue` → `OPTICOR:DISCOUNT_TOO_HIGH`. Discounts only reduce the lens part.
- **Admin free discount** (before delivery only): amount ≤ current balance, so it never creates money owed back to the client.
- **Cancel**: any status except `cancelled`, including `delivered` (stock returns, refund optional). **Step back**: super admin only, down to `confirmed`, never from `delivered`.
- **Client's own frame**: no frame-type item on the order; `frame_revenue` = sum of other items.
- **Prescription photo**: uploaded after `create_order` returns the id (`prescriptions/{order_id}/…`). If the upload fails the order stays valid and the order detail shows a "retry upload" action.
- **Client segments**: based on non-cancelled orders across all stores (New 0–1, Regular 2..N−1, Loyal = `is_loyal`). Cross-store counts for secretaries come from `client_order_stats(client_id)` (security definer, counts only).
- **Low-stock threshold**: missing `category_thresholds` row = no alert; default `low_stock_min` = 0.
- **Secretary store**: must be a `kind = 'store'` location, never the lab.
- **Global store selector** (super admin): cookie-persisted; filters Orders, Workshop, Stock tab; default for the Dashboard store filter.
- **Sidebar badges**: Workshop = orders in `confirmed` + `in_workshop` (within the selected store scope); Charges = pending recurring charges count.
- **Transfers**: dedicated page `/[locale]/stock/transfers` (super admin; history + new transfer), opened from the Stock "Transfers" button.
- **Phase 1 dev fixtures**: a fake role switch and a hard-coded store list (2 stores + lab) exist only behind a dev env flag; both are removed in Phase 3. *(Removed in phase 3; dev test stores now come from `supabase/seed.dev.sql`, run on the dev project only.)*
- **Git**: branch per phase (`phase-01-shell`, …), merged to `main` when green.

Phase 2 schema additions (2026-11-03):
- `orders.total` / `orders.lens_revenue` are generated columns; `lens_revenue ≥ 0` is a CHECK (enforces the discount rule).
- `settings_list_items.code`, `custom_fields.is_builtin`, `stock_movements.reason_id`, `notifications.dedupe_key` added (see §5).
- Views `order_numbers` and `order_balances` added; all views are `security_invoker`.
- `profiles.role` is enum `app_role`; `role_permissions.role` stays text (custom roles later). Permission keys are `domain.action` (e.g. `order.cancel`, `costs.read`), seeded in `supabase/seed.sql`.
- Cross-table rules (store kind checks, one frame per order, prefix lock…) are triggers/RPCs in phase 4, not phase 2.

Phase 4 (2026-11-03):
- Internal helpers live in schema `private` (not exposed by the Data API): role/store checks, stock lock + `move_stock`, notification fan-out (`notify_users`, `super_admin_ids`, `store_user_ids`), trigger functions.
- "Never negative stock": every stock removal takes `pg_advisory_xact_lock(store, category)` then checks the sum of movements (`OPTICOR:NO_STOCK`).
- `deliver_order` only from `in_store`. `change_order_status` never sets `cancelled` (use `cancel_order`).
- Supplier-payment charges: reason `Paiement fournisseur — <supplier>`, category code `supplier_purchase`, read-only (`OPTICOR:CHARGE_READ_ONLY`).
- Notifications store `kind` and `title_key` (= kind) with `params`; the UI translates them (phase 12).
- Tests: `npm run test:db` runs RLS + rule tests against DEV with test stores TSA/TSB and test users `opticor-test-secretary@example.com` / `opticor-test-admin@example.com` (random password per run). Their data stays on dev.

---

Phase 5 — Settings (2026-11-03):
- One lab only (unique partial index `stores_single_lab`). A store's kind never changes after creation; prefix editable until the first order (then locked by trigger).
- Product types are fixed (Montures / Lentilles / Accessoires): rename FR/EN + archive only. Categories: name, sale price (new orders only), archive, sort. Categories and types are archived, never deleted.
- List items: delete only when unused and not a system item (`code` set, used by triggers/RPCs); otherwise archive. Custom fields: the key is generated once from the French label (`slugify`, unique, immutable); type cannot change after creation; delete only when no order filled it; built-in fields: labels + visibility only. Select options are stored as `[{ value, label_fr, label_en }]`.
- Charge locations: store/lab rows come from the stores trigger; extra locations can be added; 'Général' cannot be archived.
- Loyalty threshold: `set_loyalty_threshold(n)` saves it and immediately marks clients with ≥ n delivered orders loyal, with one summary notification (`clients_became_loyal`).
- Drag-to-sort: `reorder_rows(table, ids)` (security invoker, allow-listed tables, super admin).
- Usage views (security invoker): `settings_list_usage`, `custom_field_usage`, `store_usage`, `client_delivery_counts`.

Phase 6 — Clients & Orders (2026-11-03):
- `order_overview` view (security_invoker): one row per order for board, list, client file and search (display number, client, money, frame category, `status_since`).
- `client_directory(q, segment, sort, limit, offset)` (definer, any role): clients with cross-store order counts and segments, **never money**. `client_order_stats` also returns `spent` — super admin only, null for secretaries (money summed in SQL).
- `user_names(ids)` (definer, any role) for "by Salma" in timelines/history; `similar_clients(name)` (invoker, trigram ≥ 0.4) for the new-client warning; `set_prescription_photo(order_id, path)` (definer, store access, file must exist under `prescriptions/{order_id}/`).
- New order: the booklet letter (`orders.booklet`) is an optional "Carnet" field next to the slip number; the slip is checked live and again by `create_order`. An order needs a frame, the client's own frame, or at least one other item. Pending client discount = % of the typed total, applied with a switch.
- Board: delivered column = last 7 days, cancelled (toggle) = last 30 days; a card is late after `stuck_order_days[status]`. Delivery always goes through `deliver_order` (collect dialog when a balance is due).
- WhatsApp "ready" message (FR): « Bonjour {prénom}, vos lunettes (commande {N°}) sont prêtes à la {succursale}. Reste à payer : {montant}. À bientôt ! »
- E2E: `npm run e2e:accounts` provisions DEV-only Playwright users (TSA) with random passwords in git-ignored `e2e/.auth/accounts.json`; `E2E_BASE_URL=http://localhost:3000 npm run test:e2e`.

Phase 7 — Stock (2026-11-03):
- Views (security_invoker, quantities only): `stock_overview` = every active category × visible location (0 included, so a first count can be entered with Adjust; archived categories still listed while their quantity ≠ 0); `stock_movement_history` = movements with `balance_after` (running sum per store + category), order display number, adjustment reason label, transfer counterpart (super admin only through `transfers` RLS).
- Low stock (filter + KPI) = a threshold row exists and quantity ≤ min (same rule as the notification). Pill: no threshold → neutral, < min → red, = min → amber.
- History drawer is available to secretaries too (decision 2026-11-03; read only, own store, no transfer / purchase links).
- Defence in depth: trigger `stock_movements_not_negative` raises `OPTICOR:NO_STOCK` if any insert leaves a level below 0, whoever inserts it (RPCs still lock and check first).
- Tabs: stores first, then the lab; default tab = top-bar store when one is selected. The transfer dialog (multi-line, source levels shown) opens from `/stock/transfers` and from a stock row (source + category prefilled).
- Dates are formatted **in the browser only** (`useFormat` returns "" on the server and during hydration). Node bundles its own time-zone data (2025b / 2026a) that still puts Africa/Casablanca at UTC+1, while the OS, browsers and Postgres (tz 2026f) say UTC+0 — server-rendered times were an hour off and broke hydration. Business dates stay computed in Postgres.
- Migration `20261103200423_stock_guard_definer.sql` was applied empty by mistake (CLI hang); the change is in `20261103201000_stock_guard_security_definer.sql`.

Phase 8 — Purchasing (2026-11-03):
- Views (security_invoker, super admin only through RLS, money summed in SQL): `purchase_overview` (one row per purchase with supplier, receive location, total / paid / remaining, line count, stock quantity), `supplier_balances` (purchases, total bought, paid, owed per supplier, archived included), `purchasing_summary` (owed to suppliers, unpaid purchases, total purchased).
- Suppliers: config table written directly by the super admin; two **active** suppliers can't share a name (case/spaces ignored, unique partial index → `duplicateName`); delete only when the supplier has no purchase (`inUse` → archive instead); archived suppliers can't receive new purchases.
- New purchase is a dialog on `/purchases` (supplier with inline "+ new supplier", "Reçu à" store or lab, date, supplier ref, stock lines by category — unit price × qty — and lens lines — description + amount —, live total). First payment chips: 100 % / 50 % / 30 % / custom / nothing (default nothing), amounts rounded to the cent, 100 % = exactly the total. Dates can't be in the future (UI `max` = browser's today; server allows one day of slack for time zones). Saving opens `/purchases/[id]`.
- Purchase detail: lines, total / paid / remaining, payments (each one created a read-only charge), "Add payment" with "Pay in full" / 50 % / custom, ≤ remaining (checked again under lock by `add_supplier_payment`).

Phase 9 — Charges (2026-11-03):
- Write rules: `authenticated` may insert only `amount, charge_date, category_id, location_id, reason, order_id` and update those plus `is_deleted` (same idea for `recurring_charges`). Status and approval go through `approve_charge`; supplier / recurring sources come from their trigger / job. Trigger `charges_before_write` sets `updated_at`, `approved_by/at` on a manual insert, `deleted_by/at` on soft delete (cleared on restore), and checks that the category is an active `charge_categories` item — never `supplier_purchase` on a manual charge — and that the location is active (`OPTICOR:INVALID_INPUT`). Supplier and recurring inserts skip that check, so a category archived later can't stop the monthly job.
- `charge_overview` (labels, order number, `source` manual / supplier / recurring, purchase link) and `charge_totals(from, to, location, category)` (approved / pending sums and counts, deleted excluded, summed in SQL). Page periods use today's business date from Postgres (`business_date`).
- Pending recurring charges: Approve, approve with another amount, or Skip (= soft delete, restorable). Recurring charges: delete only when they never generated a charge (`inUse` → deactivate).
- History per charge from `audit_log`: created, approved, edited (field: old → new), deleted, restored.
- Sidebar badge: `ShellValue.badges` filled by the app layout (pending charges count, super admin); refreshed by `router.refresh()`. Workshop badge comes with phase 10.
- UI rule: row menus that open dialogs use `DropdownMenu modal={false}` (otherwise Radix leaves `pointer-events: none` on `<body>` after the dialog closes), and `DataTable` ignores row clicks that bubble from portals.

Phase 10 — Workshop (2026-11-04):
- Queue = orders in `confirmed`, `in_workshop`, `prepared`, oldest first, filtered by the top-bar store (every store → store name shown on each card). No migration: `order_overview` + lens type / treatments / lens details / EP / fitting height embedded from `orders`.
- Late = more whole days in the current status than `stuck_order_days[status]` (same rule as the board); no setting → never late. The card bar turns amber on the last allowed day, red when late; late cards get a red border and an "En retard" tag; chips per step plus "En retard".
- The main button uses the order actions of the board (`change_order_status`, WhatsApp toast when the pair arrives in store); "Arrivée en succursale" takes the card out of the queue.
- Workshop badge = `confirmed` + `in_workshop` in the top-bar store: it doesn't change when an order goes to the workshop, only when it is prepared.

Phase 11 — Dashboard (2026-11-04):
- SQL (security definer, super admin only, money in SQL): `kpi_summary(from, to, store)`, `kpi_timeseries(from, to, store)` (per hour for one day — charges sit in the first hour —, per day up to 92 days, per month beyond; zero-filled; buckets add up to the summary), `kpi_breakdown(from, to, store)` (by store + `general_charges`, frame categories, treatments, lens types, client segments, busiest hours, workshop lead times). Business days use `private.day_start` (Africa/Casablanca) so date filters stay index-friendly.
- Periods: Today, 7 days (today−6 … today), This month = month to date, Last month = whole previous month, This year = year to date, Custom. "Today" comes from Postgres `business_date`. Comparison M−1 / Y−1 shifts both bounds (day clamped to the month end; a whole month stays whole); None hides the deltas. Delta = (cur − prev) / |prev|, "—" when prev = 0.
- Store filter (URL `store`, default = top-bar store): orders, payments, stock movements by `store_id`; charges by `charge_locations.store_id`; **Général and other non-store locations only under All stores**; the lab keeps its own charges.
- Interpretations of §9: owed to suppliers = all time, by the purchase's receive location when a store is selected; loyal clients / repeat rate = among clients served in the period (repeat = ≥ 2 delivered orders, all time, all stores); workshop time = average days created → first `in_store` and created → `delivered` for orders of the period; discounts and damaged frames count non-cancelled orders / frame types only; pending charges = all months.
- Hero card = CA, or Montant encaissé when the period is Today. Second row: discounts, cancellation rate, owed to suppliers, damaged frames, loyal clients + repeat rate, workshop time. Demo margin cards, "orders without costs" and stock value are dropped.
- Tests: `tests/db/dashboard.test.ts` checks every formula on a fixed dataset in store TSK dated Dec 2000 – Feb 2001 (exact even under All stores). The fixture is rebuilt before and removed after each run (TSK stays inactive), except its one purchase, whose supplier-payment charge is read-only.

Phase 12 — Notifications (2026-11-04):
- "Once" per kind and recipient: `client_became_loyal` once per client (dedupe); `low_stock` once per crossing down to ≤ min (a refill and a new crossing notify again); `order_stuck` once per order + status (dedupe, the daily job can run any number of times); `duplicate_slip_blocked` once per blocked attempt, super admins only; `recurring_charges_pending` once per day (dedupe); `clients_became_loyal` once per threshold change that makes clients loyal. Checked in `tests/db/notifications.test.ts` (+ `rules.test.ts` for loyalty).
- Realtime: `notifications` is in the `supabase_realtime` publication; the app subscribes to `postgres_changes` on its own rows (`user_id=eq.<me>`), RLS still applies. One subscription per signed-in user in `NotificationsProvider`, shared by the top-bar bell and the phone bottom-bar item; a new row bumps the count and shows a toast with "Ouvrir". The server count (app layout) re-syncs it on every `router.refresh()`.
- Mark read: `mark_notifications_read(ids | null)` (security invoker: own unread rows, `read_at` only). Clicking a notification marks it read and opens its deep link; "Tout marquer comme lu" in the bell and on `/notifications` (chips Toutes / Non lues, unread first).
- Texts are built in the app from `kind` + `params` (FR/EN): `low_stock` links to `/stock?location=<store>`, `clients_became_loyal` to `/clients?segment=loyal`, orders to `/orders/<id>`, clients to `/clients/<id>`, recurring to `/charges`; an unknown kind falls back to the stored `link`.

Phase 13 — Hardening & production (2026-11-04):
- Security review written up in `docs/SECURITY-REVIEW.md`; production steps in `docs/DEPLOY.md` (replaces `AUTH-SETUP.md`). Production is only ever touched by the owner, following DEPLOY.md.
- `anon` has no privilege in `public` (tables, views, sequences, functions, and by default for new objects): the app never queries signed out. Views are read-only for `authenticated`. Trigger functions aren't callable.
- Supabase advisor 0029 ("signed-in users can execute SECURITY DEFINER function", 26 RPCs) is **accepted**: the RPCs are the write API (secretaries have no direct write on orders/payments/stock) and each checks role/store first. `tests/db/security.test.ts` reads the exposed RPCs and relations from the API's OpenAPI and fails if a new one isn't classified (super admin only / store-scoped / any role / invoker / server-only).
- Security headers on every response (`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS), no `X-Powered-By`. ~~No CSP yet~~ → CSP added in security review 2 (below).
- Every Server Action input goes through zod, including search boxes and ids (`src/lib/schemas.ts`).
- Route states: skeleton `loading.tsx` (board and dashboard variants), `error.tsx` with "Réessayer" + digest reference (no error text from the server), `global-error.tsx`, translated 404 for unknown paths.
- Accessibility target WCAG 2.1 AA, checked by axe on every page and role (`e2e/a11y.spec.ts`, serious/critical = failure) plus a no-sideways-scroll check at 375 px. Dialogs return focus to what opened them (`useReturnFocus`). Board cards drag by pointer anywhere, by keyboard from the ⋮⋮ handle. Archived rows are tinted, not faded with opacity.
- E2E data on dev: `npm run e2e:accounts` cancels the open orders older than an hour in the test stores (TSA/TSB), so boards don't fill up across runs.

Security review 2 (2026-11-13) — see `docs/SECURITY-REVIEW.md` §6:
- **Brute force**: the sign-in and forgot-password Server Actions call Supabase Auth from the server, so Auth's per-IP limits see the host's IPs. The app counts attempts itself in `private.auth_attempts` (keys = sha256 of client IP / of email, 15-minute window): sign-in = **wrong passwords only**, 10 per email and 30 per IP; password reset = every request, 3 per email and 10 per IP. Over the limit → `rateLimited`. Functions `auth_attempt_counts` / `auth_record_attempt` are service-role only (`src/features/auth/throttle.ts`); if the database can't be reached the attempt is allowed and logged (fail open).
- **Set password**: only a session opened by an invite / reset link within the hour (JWT `amr`: Supabase records these links as `otp`) may choose a password (`canSetPassword`, page + action). A plain signed-in session gets "ask for a new link": nobody at an unattended, signed-in computer can change the password. Minimum length 10 (= Supabase Auth setting).
- **CSP** on every response (`next.config.ts`), static: `default-src 'self'`; scripts/styles self + `'unsafe-inline'` (Next / next-themes inline scripts; `'unsafe-eval'` in dev only); `connect-src` self + the Supabase project (https + wss); `img-src` self, data:, blob:, Supabase; `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`; vercel.live allowed on preview deployments only. Zod is jitless in the browser (`src/instrumentation-client.ts`) so no eval is needed. Nonce-based `script-src` = later. Also `Cross-Origin-Opener-Policy: same-origin`.
- Session cookies: `Secure` in production builds, `SameSite=Lax`, path `/` (`authCookieOptions`, same for server, proxy and browser clients).
- `clients.full_name` ≤ 120 and `clients.notes` ≤ 500 characters in the database too (secretaries may write those columns through the API without the app).

Secretary → admin WhatsApp (2026-11-13):
- `profiles.whatsapp_e164` (E.164, optional), set only by a super admin through `set_user_whatsapp(user, phone | null)` in Settings › Users (super admin rows, his own included).
- Secretaries read the numbers only through `admin_contacts()` (any role, security definer): active super admins with a number, never the caller, and only id, name and number. Profiles stay unreadable to secretaries otherwise. Both RPCs are classified in `tests/db/security.test.ts` (advisor 0029, accepted like the others).
- Free `wa.me` links (no WhatsApp Business API): the secretary sends the message herself. Messages are translated (`notifyAdmin.messages.*`) in her language.

## 12. Later (design for it, don't build it)

- Excel history import (~2,270 orders 2021–2023, prescriptions as text like `-1.75(-2 a 69)`, treatments like AR / BL / BLEU CAT / PGX / PROG / DF / LENTILLE): imported orders get `source = 'legacy'` column (add now, default `'app'`), status delivered, no stock movements, count toward loyalty when phone matches.
- Custom roles UI, exports, invoices, per-order costs.
