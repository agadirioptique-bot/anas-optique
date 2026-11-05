// DEV ONLY — realistic demo data for the user guide screenshots (docs/guide_emploi.pdf).
//
//   node --env-file=.env.local scripts/guide/seed-demo.mjs
//
// Creates (once) a second store "Succursale Anfa", three demo accounts (super admin Karim Alaoui,
// secretaries Salma Bennani @ Maârif and Nadia El Idrissi @ Anfa), suppliers, purchases with stock,
// charges, recurring charges, clients and ~20 orders in every status over the last 11 months.
// Everything goes through the app's RPCs as those users (same rules as the app); only timestamps are
// moved back afterwards with the service role so the dashboard has a history.
// Passwords are random, written to the git-ignored e2e/.auth/guide-accounts.json, never printed.
import { randomBytes, randomInt } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) throw new Error("run with --env-file=.env.local (dev project)");
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(URL, SERVICE, opts);

const must = (label) => ({ data, error }) => {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
};
const DAY = 86_400_000;
const ago = (days, hour = 10) => {
  const d = new Date(Date.now() - days * DAY);
  d.setUTCHours(hour, randomInt(0, 59), 0, 0);
  return d;
};

// ---------------------------------------------------------------------------------------------
// Stores and accounts
async function store(prefix, name) {
  const { data } = await service.from("stores").select("id").eq("prefix", prefix).maybeSingle();
  if (data) {
    await service.from("stores").update({ is_active: true }).eq("id", data.id);
    return data.id;
  }
  return must(`store ${prefix}`)(await service.from("stores").insert({ prefix, name, kind: "store" }).select("id").single()).id;
}

async function account(email, fullName, role, storeId, password) {
  const { data: profile } = await service.from("profiles").select("id").eq("email", email).maybeSingle();
  let id = profile?.id;
  if (id) must("password")(await service.auth.admin.updateUserById(id, { password, ban_duration: "none" }));
  else id = must(`user ${email}`)(await service.auth.admin.createUser({ email, password, email_confirm: true })).user.id;
  must("profile")(await service.from("profiles").upsert({ id, email, full_name: fullName, role, store_id: storeId, is_active: true }));
  const db = createClient(URL, ANON, opts);
  must(`sign in ${email}`)(await db.auth.signInWithPassword({ email, password }));
  return { id, db };
}

const maarif = await store("MRF", "Succursale Maârif");
const anfa = await store("ANF", "Succursale Anfa");
const { data: lab } = await service.from("stores").select("id").eq("kind", "lab").limit(1).single();

const password = randomBytes(24).toString("base64url");
const admin = await account("opticor-demo-admin@example.com", "Karim Alaoui", "super_admin", null, password);
const salma = await account("opticor-demo-salma@example.com", "Salma Bennani", "secretary", maarif, password);
const nadia = await account("opticor-demo-nadia@example.com", "Nadia El Idrissi", "secretary", anfa, password);

const dir = join(process.cwd(), "e2e/.auth");
mkdirSync(dir, { recursive: true });
const file = join(dir, "guide-accounts.json");
writeFileSync(
  file,
  JSON.stringify(
    {
      admin: { email: "opticor-demo-admin@example.com", password },
      secretary: { email: "opticor-demo-salma@example.com", password },
      secretaryAnfa: { email: "opticor-demo-nadia@example.com", password },
      stores: { maarif, anfa },
    },
    null,
    2,
  ),
);
chmodSync(file, 0o600);

// ---------------------------------------------------------------------------------------------
// Reference ids
const item = async (list, code) =>
  must(`${list}.${code}`)(await service.from("settings_list_items").select("id").eq("list_key", list).eq("code", code).single()).id;
const ids = {
  cash: await item("payment_methods", "cash"),
  card: await item("payment_methods", "card"),
  transfer: await item("payment_methods", "transfer"),
  single: await item("lens_types", "single_vision"),
  progressive: await item("lens_types", "progressive"),
  bifocal: await item("lens_types", "bifocal"),
  ar: await item("treatments", "anti_reflective"),
  blue: await item("treatments", "blue_light"),
  photo: await item("treatments", "photochromic"),
  hard: await item("treatments", "hard_coat"),
  rent: await item("charge_categories", "rent"),
  electricity: await item("charge_categories", "electricity"),
  internet: await item("charge_categories", "internet"),
  salaries: await item("charge_categories", "salaries"),
  delivery: await item("charge_categories", "delivery"),
  remake: await item("charge_categories", "lens_remake"),
  changedMind: await item("cancel_reasons", "client_changed_mind"),
  vl: await item("vision_types", "distance"),
  vp: await item("vision_types", "near"),
  vlvp: await item("vision_types", "distance_near"),
};
const { data: frames } = await service.from("product_types").select("id").eq("key", "frames").single();
const cats = Object.fromEntries(
  (await service.from("product_categories").select("id, name").eq("product_type_id", frames.id).eq("is_archived", false)).data.map((c) => [c.name, c.id]),
);
const A = cats["Catégorie A"], B = cats["Catégorie B"], C = cats["Catégorie C"], D = cats["Catégorie D"], E = cats["Catégorie E"];
const { data: locations } = await service.from("charge_locations").select("id, store_id, is_general");
const locOf = (storeId) => locations.find((l) => l.store_id === storeId)?.id;
const general = locations.find((l) => l.is_general).id;
// The screenshots filter the Charges page on a store's location.
const saved = JSON.parse(readFileSync(file, "utf8"));
writeFileSync(file, JSON.stringify({ ...saved, chargeLocations: { maarif: locOf(maarif), anfa: locOf(anfa) } }, null, 2));

// Data already there (second run): only the passwords were reset.
const { data: existing } = await service.from("suppliers").select("id").eq("name", "Atlas Optique Distribution").maybeSingle();
if (existing) {
  console.log("demo data already present: accounts refreshed only");
  process.exit(0);
}


// Low-stock thresholds (Paramètres › Seuils): a few categories warn when they run low.
must("thresholds")(
  await admin.db.from("category_thresholds").upsert([
    { store_id: maarif, category_id: B, low_stock_min: 3 },
    { store_id: maarif, category_id: D, low_stock_min: 2 },
    { store_id: anfa, category_id: C, low_stock_min: 3 },
  ]),
);

// ---------------------------------------------------------------------------------------------
// Suppliers, purchases (stock in), supplier payments (→ read-only charges)
const supplier = async (name, phone, note) =>
  must(name)(await admin.db.from("suppliers").insert({ name, phone, note }).select("id").single()).id;
const atlas = await supplier("Atlas Optique Distribution", "+212522445566", "Montures — livraison le mardi");
const lensLab = await supplier("Labo Verres Casa", "+212522778899", "Verres sur mesure, délai 3 à 5 jours");
const vision = await supplier("Vision Pro Maroc", "+212661234567", "Lentilles et accessoires");

const purchase = async (payload, when) => {
  const result = must("create_purchase")(await admin.db.rpc("create_purchase", { payload }));
  return { id: result?.purchase_id ?? result, when };
};
const purchases = [
  await purchase(
    { supplier_id: atlas, receive_store_id: maarif, purchase_date: ago(75).toISOString().slice(0, 10), supplier_ref: "AT-2026-0412",
      lines: [ { kind: "stock", category_id: A, unit_price: 110, qty: 12 }, { kind: "stock", category_id: B, unit_price: 190, qty: 7 },
               { kind: "stock", category_id: C, unit_price: 310, qty: 7 }, { kind: "stock", category_id: D, unit_price: 480, qty: 5 } ],
      payment: { amount: 3500, method_id: ids.transfer, paid_at: ago(75).toISOString().slice(0, 10) } },
    75,
  ),
  await purchase(
    { supplier_id: atlas, receive_store_id: anfa, purchase_date: ago(60).toISOString().slice(0, 10), supplier_ref: "AT-2026-0467",
      lines: [ { kind: "stock", category_id: A, unit_price: 110, qty: 8 }, { kind: "stock", category_id: B, unit_price: 190, qty: 7 },
               { kind: "stock", category_id: C, unit_price: 310, qty: 5 }, { kind: "stock", category_id: E, unit_price: 690, qty: 3 } ],
      payment: { amount: 5280, method_id: ids.transfer, paid_at: ago(60).toISOString().slice(0, 10) } },
    60,
  ),
  await purchase(
    { supplier_id: lensLab, receive_store_id: lab.id, purchase_date: ago(20).toISOString().slice(0, 10), supplier_ref: "LVC-118",
      lines: [ { kind: "lens", description: "Verres unifocaux 1.6 anti-reflet — 20 paires", amount: 4200 },
               { kind: "lens", description: "Verres progressifs — 6 paires", amount: 3600 } ],
      payment: { amount: 2000, method_id: ids.cash, paid_at: ago(20).toISOString().slice(0, 10) } },
    20,
  ),
  await purchase(
    { supplier_id: vision, receive_store_id: maarif, purchase_date: ago(8).toISOString().slice(0, 10),
      lines: [ { kind: "stock", category_id: E, unit_price: 690, qty: 2 }, { kind: "stock", category_id: C, unit_price: 310, qty: 3 } ] },
    8,
  ),
];
console.log("purchases", purchases.length);

// ---------------------------------------------------------------------------------------------
// Charges: recurring (rent, internet) and a few manual ones over the months
must("recurring")(
  await admin.db.from("recurring_charges").insert([
    { label: "Loyer Maârif", amount: 7000, category_id: ids.rent, location_id: locOf(maarif), day_of_month: 1 },
    { label: "Loyer Anfa", amount: 9000, category_id: ids.rent, location_id: locOf(anfa), day_of_month: 1 },
    { label: "Internet et téléphone", amount: 450, category_id: ids.internet, location_id: general, day_of_month: 5 },
  ]),
);
const manual = [];
for (let m = 1; m <= 10; m++) {
  const day = ago(m * 30 + 2);
  const date = day.toISOString().slice(0, 10);
  manual.push(
    { amount: 7000, category_id: ids.rent, location_id: locOf(maarif), reason: "Loyer Maârif", charge_date: date },
    { amount: 9000, category_id: ids.rent, location_id: locOf(anfa), reason: "Loyer Anfa", charge_date: date },
    { amount: 14500, category_id: ids.salaries, location_id: general, reason: "Salaires du mois", charge_date: date },
    { amount: 380 + randomInt(0, 260), category_id: ids.electricity, location_id: locOf(maarif), reason: "Facture Lydec", charge_date: date },
  );
}
manual.push(
  { amount: 120, category_id: ids.delivery, location_id: locOf(anfa), reason: "Coursier verres labo", charge_date: ago(6).toISOString().slice(0, 10) },
  { amount: 350, category_id: ids.remake, location_id: locOf(maarif), reason: "Verre refait (rayure à la livraison)", charge_date: ago(3).toISOString().slice(0, 10) },
);
must("charges")(await admin.db.from("charges").insert(manual));

// ---------------------------------------------------------------------------------------------
// Clients and orders
const phone = () => `+2126${randomInt(10_000_000, 99_999_999)}`;
let slip = 1200;
const rx = (sph, cyl, axis, add) => ({ re_sph: sph, re_cyl: cyl, re_axis: axis, re_add: add, le_sph: sph + 0.25, le_cyl: cyl, le_axis: axis ? (axis + 10) % 180 : null, le_add: add });

/**
 * One order: created by the store's secretary, moved through the statuses, then backdated.
 * `to`: final status; `days`: age; `frame`: category from stock or null (client's own frame).
 */
async function order({ by, storeId, client, total, deposit, frame, lens, treatments, prescription, vision, to, days, doctor, discount }) {
  const payload = {
    store_id: storeId,
    slip_number: ++slip,
    ...(client.id ? { client_id: client.id } : { new_client: { full_name: client.name, phone_e164: client.phone, has_whatsapp: client.whatsapp ?? true } }),
    client_own_frame: !frame,
    items: frame ? [{ category_id: frame, qty: 1 }] : [],
    lens_type_id: lens,
    treatment_ids: treatments,
    subtotal: total,
    ...prescription,
    vision_type_id: vision,
    ep_re: 31.5, ep_le: 32,
    doctor_name: doctor ?? null,
    deposit: deposit ? { amount: deposit, method_id: deposit >= 1000 ? ids.card : ids.cash } : null,
  };
  const created = must("create_order")(await by.db.rpc("create_order", { payload }));
  if (created?.error) throw new Error(`create_order: ${created.error}`);
  const orderId = created.order_id;
  if (!client.id) client.id = must("client")(await service.from("orders").select("client_id").eq("id", orderId).single()).client_id;
  if (discount) must("discount")(await admin.db.rpc("apply_free_discount", { p_order_id: orderId, p_amount: discount }));

  const flow = ["in_workshop", "prepared", "in_store"];
  const target = to === "delivered" ? 3 : to === "cancelled" ? 0 : flow.indexOf(to) + 1;
  for (const status of flow.slice(0, target)) must(status)(await by.db.rpc("change_order_status", { p_order_id: orderId, p_to_status: status }));
  if (to === "delivered") {
    const { data: bal } = await service.from("order_balances").select("balance").eq("order_id", orderId).single();
    must("deliver")(
      await by.db.rpc("deliver_order", { p_order_id: orderId, p_final_payment: bal.balance > 0 ? { amount: bal.balance, method_id: ids.cash } : null }),
    );
  }
  if (to === "cancelled") {
    must("cancel")(
      await admin.db.rpc("cancel_order", { p_order_id: orderId, p_reason_id: ids.changedMind, p_note: "Le client préfère attendre", p_refund_amount: deposit ?? 0, p_refund_method_id: deposit ? ids.cash : null }),
    );
  }
  await backdate(orderId, days, to);
  return orderId;
}

/** Moves the order's own timestamps back: created `days` ago, each later step a day or two after. */
async function backdate(orderId, days, to) {
  const created = ago(days, 9 + randomInt(0, 8));
  const step = (n) => new Date(created.getTime() + n * DAY * (to === "delivered" ? 1.6 : 1) + randomInt(1, 5) * 3_600_000).toISOString();
  must("orders time")(
    await service.from("orders").update({
      created_at: created.toISOString(),
      ...(to === "delivered" ? { delivered_at: step(4) } : {}),
      ...(to === "cancelled" ? { cancelled_at: step(1) } : {}),
    }).eq("id", orderId),
  );
  const { data: history } = await service.from("order_status_history").select("id, to_status").eq("order_id", orderId).order("changed_at");
  const index = { confirmed: 0, in_workshop: 1, prepared: 2, in_store: 3, delivered: 4, cancelled: 1 };
  for (const h of history) must("history time")(await service.from("order_status_history").update({ changed_at: h.to_status === "confirmed" ? created.toISOString() : step(index[h.to_status]) }).eq("id", h.id));
  const { data: payments } = await service.from("payments").select("id, kind").eq("order_id", orderId).order("received_at");
  for (const [i, p] of payments.entries()) must("payment time")(await service.from("payments").update({ received_at: i === 0 && p.kind !== "refund" ? created.toISOString() : step(4) }).eq("id", p.id));
  await service.from("stock_movements").update({ created_at: created.toISOString() }).eq("ref_id", orderId);
}

const people = {
  youssef: { name: "Youssef El Amrani", phone: phone() },
  fz: { name: "Fatima Zahra Benjelloun", phone: phone() },
  mehdi: { name: "Mehdi Tazi", phone: phone() },
  khadija: { name: "Khadija Chraibi", phone: phone(), whatsapp: false },
  omar: { name: "Omar Berrada", phone: phone() },
  salmaL: { name: "Salma Lahlou", phone: phone() },
  hamza: { name: "Hamza Fassi Fihri", phone: phone() },
  imane: { name: "Imane Sebti", phone: phone() },
  rachid: { name: "Rachid Ouazzani", phone: phone(), whatsapp: false },
  laila: { name: "Laila Benkirane", phone: phone() },
  amine: { name: "Amine Kettani", phone: phone() },
  sara: { name: "Sara Alami", phone: phone() },
  hicham: { name: "Hicham Naciri", phone: phone() },
  nora: { name: "Nora El Fassi", phone: phone() },
  driss: { name: "Driss Bennis", phone: phone() },
};
const M = { by: salma, storeId: maarif };
const N = { by: nadia, storeId: anfa };
const sv = (s, c = 0, a = null) => rx(s, c, a, null);
const prog = (s, add) => rx(s, -0.5, 90, add);

// A loyal client: five deliveries over the year (loyalty threshold = 5) — the last one makes him loyal.
for (const [i, days] of [330, 250, 170, 95, 40].entries())
  await order({ ...M, client: people.youssef, total: 900 + i * 150, deposit: 500, frame: i % 2 ? B : A, lens: ids.single, treatments: [ids.ar], prescription: sv(-1.75, -0.5, 10), vision: ids.vl, to: "delivered", days });

// Delivered history (both stores) for the charts.
const history = [
  [M, people.fz, 2400, 1000, C, ids.progressive, [ids.ar, ids.blue], prog(1.25, 2), ids.vlvp, 300],
  [N, people.mehdi, 1300, 500, B, ids.single, [ids.blue], sv(-2.5, -0.75, 170), ids.vl, 280],
  [M, people.omar, 650, 650, null, ids.single, [ids.hard], sv(0.75), ids.vp, 220],
  [N, people.laila, 3100, 1500, C, ids.progressive, [ids.ar, ids.photo], prog(-0.5, 1.75), ids.vlvp, 200],
  [N, people.amine, 1100, 400, A, ids.single, [ids.ar], sv(-1.25, -0.25, 5), ids.vl, 150],
  [M, people.sara, 1800, 900, C, ids.single, [ids.ar, ids.blue], sv(-3, -1, 175), ids.vl, 120],
  [N, people.hicham, 4200, 2000, E, ids.progressive, [ids.ar, ids.photo], prog(1.5, 2.25), ids.vlvp, 75],
  [M, people.imane, 1450, 700, B, ids.single, [ids.blue], sv(-0.75), ids.vl, 45],
  [N, people.nora, 950, 950, null, ids.bifocal, [ids.hard], prog(0.5, 1.5), ids.vlvp, 30],
  [M, people.driss, 1600, 600, C, ids.single, [ids.ar], sv(-2, -0.5, 80), ids.vl, 14],
  [N, people.salmaL, 1250, 1250, B, ids.single, [ids.blue], sv(-1), ids.vl, 4],
];
for (const [who, client, total, deposit, frame, lens, treatments, prescription, vision, days] of history)
  await order({ ...who, client, total, deposit, frame, lens, treatments, prescription, vision, to: "delivered", days, doctor: "Dr. Benali" });

// The live board: one or two orders in each step, one of them late, one cancelled.
await order({ ...M, client: people.khadija, total: 2900, deposit: 900, frame: D, lens: ids.progressive, treatments: [ids.ar], prescription: prog(1, 2), vision: ids.vlvp, to: "in_store", days: 6 });
await order({ ...N, client: people.rachid, total: 1200, deposit: 400, frame: B, lens: ids.single, treatments: [ids.ar, ids.blue], prescription: sv(-1.5, -0.5, 95), vision: ids.vl, to: "in_store", days: 2 });
await order({ ...M, client: people.hamza, total: 1700, deposit: 800, frame: C, lens: ids.single, treatments: [ids.photo], prescription: sv(-2.25, -0.75, 180), vision: ids.vl, to: "prepared", days: 3 });
await order({ ...N, client: people.fz, total: 2600, deposit: 1300, frame: null, lens: ids.progressive, treatments: [ids.ar, ids.blue], prescription: prog(1.5, 2.25), vision: ids.vlvp, to: "in_workshop", days: 9 });
await order({ ...M, client: people.mehdi, total: 980, deposit: 300, frame: A, lens: ids.single, treatments: [ids.hard], prescription: sv(-2.75, -0.5, 165), vision: ids.vl, to: "in_workshop", days: 1 });
await order({ ...M, client: people.laila, total: 1400, deposit: 500, frame: B, lens: ids.single, treatments: [ids.ar], prescription: sv(-0.5), vision: ids.vp, to: "confirmed", days: 0 });
await order({ ...N, client: people.amine, total: 2100, deposit: 0, frame: C, lens: ids.single, treatments: [ids.ar, ids.blue], prescription: sv(-1.25, -0.25, 5), vision: ids.vl, to: "confirmed", days: 0 });
await order({ ...M, client: people.sara, total: 1350, deposit: 400, frame: B, lens: ids.single, treatments: [ids.blue], prescription: sv(-3, -1, 175), vision: ids.vl, to: "cancelled", days: 12 });

// A pre-approved discount waiting for a client's next order (Clients › fiche client).
must("pending discount")(await admin.db.rpc("set_client_discount", { p_client_id: people.omar.id, p_type: "percent", p_value: 10, p_note: "Client de longue date" }));

// Daily jobs (pg_cron) once now: this month's recurring charges (pending) and late-order alerts.
const today = must("business_date")(await service.rpc("business_date", { ts: new Date().toISOString() }));
must("recurring job")(await service.rpc("generate_recurring_charges", { p_date: today }));
must("stuck job")(await service.rpc("notify_stuck_orders"));
console.log("demo data created");
