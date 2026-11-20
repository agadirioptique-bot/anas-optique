# OPTICOR — UI Reference (copied from the demo)

Live reference: https://opticor.vercel.app (demo with fake data). If the demo source code is available, it is in `_reference/opticor-demo/` — **copy its UI components and styles, never its data layer** (localStorage / `anass-vision:db`).

When in doubt about a screen, open the live demo (or the screenshots in `docs/ui/`) and match it.

---

## 1. Foundations

- Component library: **shadcn/ui** on Tailwind, icons **lucide-react**, font **Inter** (`next/font`), charts **Recharts**.
- Themes: light (default) + dark via `next-themes`, class strategy (`.dark` on `<html>`, Tailwind `@custom-variant dark`), user toggle in avatar menu.
- Radius: `--radius: 0.7rem`. Cards: white, 1px border, rounded-xl, no heavy shadow.
- Density: comfortable, lots of white space, page content max-width ≈ 1120px centered.

### Color tokens (CSS variables, exact values from the demo)

| Token | Light | Dark |
|---|---|---|
| `--background` | `#f6f8f9` | `#0a1417` |
| `--foreground` | `#0f1f26` | `#e3ecef` |
| `--card` | `#ffffff` | `#101d22` |
| `--popover` | `#ffffff` | `#12222a` |
| `--primary` (deep teal) | `#0f4c5c` | `#63b6c9` |
| `--primary-foreground` | `#ffffff` | `#062a33` |
| `--secondary` / `--muted` | `#eef2f4` | `#1a2c33` / `#17272d` |
| `--muted-foreground` | `#5b6b77` | `#97a9b1` |
| `--accent` | `#e8f1f3` | `#173038` |
| `--accent-foreground` | `#0f4c5c` | `#bfe3eb` |
| `--destructive` | `#c0392b` | `#ec7063` |
| `--border` | `#e1e7ea` | `#20343b` |
| `--input` | `#d5dde1` | `#2a4049` |
| `--ring` | `#0f4c5c` | `#63b6c9` |
| `--attention` (orange CTA / badges) | `#e36414` | `#f0843f` |
| `--attention-text` | `#a3410a` | `#f59f68` |
| `--attention-strong` | `#c2530f` | `#f0843f` |
| `--success` | `#2a9d8f` | `#3cbfae` |
| `--success-text` | `#1e7a6f` | `#5fd4c4` |
| `--whatsapp` | `#1fa855` | `#3ccf74` |
| `--status-confirmed` | `#4c9ef5` | `#4c95e8` |
| `--status-workshop` | `#6a35d4` | `#7446d8` |
| `--status-prepared` | `#c98500` | `#b98300` |
| `--status-in_store` | `#0f8f84` | `#0f958a` |
| `--status-delivered` | `#22a559` | `#4ade80` |
| `--status-cancelled` | `#b4bcc4` | `#64748b` |
| `--chart-1..5` | `#0a8aa3 #e36414 #7c5cd6 #b58900 #d24f7c` | `#008da6 #dd6424 #9278e6 #b68a0e #d65a8c` |
| `--chart-muted` / `--chart-grid` | `#9aa6ae` / `#e8edf0` | `#6b7c85` / `#1c2e35` |

`theme-color` pair as in the demo: light `#f6f8f9`, dark `#0a1417` (via `prefers-color-scheme`). Page title pattern: `{Page} · OPTICOR`.

---

## 2. App shell

**Sidebar (left, 256px `w-64` on lg+, 76px icon rail on tablets (md) and when collapsed)**
- Top: logo = rounded-square teal tile with a glasses icon + wordmark `OPTICOR` (uppercase, letter-spaced).
- Big primary button **+ New order** (full width, teal).
- Nav items (icon + label, active = light teal pill with left indicator bar). Orange count badge on the right: Workshop = orders in confirmed + in_workshop, Charges = pending recurring charges.
  - Super admin: Dashboard, Orders, Workshop, Clients, Stock, Purchasing, Charges, Settings.
  - Secretary: Orders, Clients, Stock.
- Bottom: "Collapse menu".

**Top bar**
- Store selector pill (pin icon): super admin → dropdown "All stores / each store / lab" (cookie-persisted, filters Orders / Workshop / Stock, default Dashboard filter); secretary → static pill with her store name.
- Search input "Search a client, an order…" with `Ctrl K` hint → command palette (clients + orders grouped, status badge on orders).
- Right: bell with orange count badge, avatar circle with initials (menu: name, role, language FR/EN, theme, sign out).
- (Demo-only "DEMO · Super admin" switcher is removed.)

**Mobile (< md)**: sidebar hidden; bottom bar with Orders, Clients, big round **+** (new order), Stock, Notifications. Board columns swipe horizontally; each card has a "Next step" button (shown on desktop too since 2026-11-20, where the five columns share the width from `xl`).

**Page header**: H1 (bold, ~28px) + muted subtitle (e.g. "Orders of Succursale Centre."), primary action top-right.

---

## 3. Recurring components

- **Filter chips**: rounded-full, outline; active = filled teal with white text. Count inside chip ("Loyal · 151").
- **Segmented control**: "Board | List", "vs M−1 | vs Y−1 | None".
- **Status badge**: small pill with colored dot using `--status-*`.
- **Money due badge**: orange tinted pill "Due DH 1,100" (`--attention` bg 10–15 %, `--attention-text` text).
- **Late indicator**: clock icon + "for 8 days" in red when beyond threshold.
- **Quantity pill** in tables: red tint when below threshold, amber when equal, neutral otherwise.
- **WhatsApp icon** (green) on clients/cards when `has_whatsapp`.
- **KPI card**: label + small icon tile top-right, big number, delta pill (green ↗ / red ↘ with %), "vs M−1", optional sparkline.
- **Stepper timeline** (order detail): 5 circles connected, done = filled teal check, current = ring, upcoming = grey; date + user under each.
- **Sticky summary card** (new order, right column): client, store, prescription in optician notation `RE −1.25 (−0.50 × 90°)`, frame, lenses, Total / Deposit / **Balance due** (big teal), Back + Next/Confirm buttons. Confirm button is **orange** (`--attention`).
- **Tables**: header row muted small caps-ish, sortable columns with ↑↓ icon, row hover, row actions as icon buttons on the right.
- **Empty state**: muted text "Not enough data for this period." inside the card.
- **Access denied**: centered card, red shield icon, title "Access denied", text "Your role does not give access to this page…", button "Back to home".
- **Toasts**: sonner, bottom-right.
- Number format: `DH 1,850` in EN, `1 850 DH` in FR (use `Intl.NumberFormat` per locale). Dates: `22 Oct 2026, 18:37`.

---

## 4. Screens to reproduce (demo routes → new routes)

| Demo route | New route | Notes |
|---|---|---|
| `/en/orders` | `/[locale]/orders` | Board 5 columns (Confirmed, In workshop, Prepared, In store, Delivered — "Delivered in the last 7 days"), card: number, client, total, due badge, time in step, WhatsApp icon. |
| `/en/orders/new` | `/[locale]/orders/new` | 3-step wizard. Step 3 frame picker becomes **category cards** (name, price, "N in stock"), see SPEC §8. Add "N° du bon" field with fixed prefix. |
| `/en/orders/[id]` | `/[locale]/orders/[id]` | Remove "Costs and margin" panel. |
| `/en/workshop` | `/[locale]/workshop` | Summary strip (in progress, average age, late, by step dots), chips, 3-column card grid with prescription block and full-width main action button. |
| `/en/clients` (+ `/[id]`) | same | Chips All/New/Regular/Loyal, table, client file with stats row + "Vision over time" chart + orders table. |
| `/en/stock` | `/[locale]/stock` | Location tabs, KPI strip (no value column), chips by product type, "Low stock only", "Transfers" button. |
| `/en/stock/transfers` | `/[locale]/stock/transfers` | Super admin: transfer history + new transfer (opened from the Stock "Transfers" button). |
| `/en/purchases` | `/[locale]/purchases` | Tabs Purchases / Suppliers; columns date, supplier, received at, total, paid, remaining. No draft/ordered statuses. |
| `/en/charges` (Expenses) | `/[locale]/charges` | Rename to **Charges**; replace the fixed-expenses grid and "Costs per order" tab with the charges ledger + pending recurring + recurring manager (SPEC §8). |
| `/en/dashboard` | `/[locale]/dashboard` | Same layout & components; KPI set from SPEC §9 (CA, Montant encaissé, Charges, NET …). |
| `/en/settings` | `/[locale]/settings` | Left sub-nav + content card; list editor with FR/EN label inputs, drag handle, Archive button, "used in N orders". |
| `/en/notifications` | same | List, unread first. |
| sign-in page | `/[locale]/login`, `/[locale]/set-password`, `/[locale]/forgot-password` | Demo's sign-in card style (logo, FR/EN switch top-right) **without** the "Enter as…" demo cards. |
