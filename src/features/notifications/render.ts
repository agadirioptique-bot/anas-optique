/**
 * How each notification kind reads and where it leads (SPEC §10). The database stores the kind,
 * its params and a fallback link; the text is translated here so it follows the user's language.
 */
export const KINDS = [
  "client_became_loyal",
  "clients_became_loyal",
  "low_stock",
  "order_stuck",
  "duplicate_slip_blocked",
  "recurring_charges_pending",
] as const;
export type NotificationKind = (typeof KINDS)[number] | "unknown";

export interface NotificationRow {
  id: string;
  kind: string;
  params: Record<string, unknown>;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationView {
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

const str = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

/** `t` is scoped to `notifications.kinds`; `statusLabel` translates an order status. */
export function notificationView(n: NotificationRow, t: Translate, statusLabel: (status: string) => string, now: Date): NotificationView {
  const p = n.params ?? {};
  const kind: NotificationKind = (KINDS as readonly string[]).includes(n.kind) ? (n.kind as NotificationKind) : "unknown";
  const view = (values: Record<string, string | number>, href: string): NotificationView => ({
    kind,
    title: t(`${kind}.title`),
    body: t(`${kind}.body`, values),
    href,
  });
  switch (kind) {
    case "client_became_loyal":
      return view({ client: str(p.client_name), orders: num(p.orders) }, p.client_id ? `/clients/${str(p.client_id)}` : (n.link ?? "/clients"));
    case "clients_became_loyal":
      return view({ count: num(p.count), threshold: num(p.threshold) }, "/clients?segment=loyal");
    case "low_stock":
      return view(
        { category: str(p.category_name), store: str(p.store_name), quantity: num(p.quantity), min: num(p.min) },
        p.store_id ? `/stock?location=${str(p.store_id)}` : "/stock",
      );
    case "order_stuck": {
      const since = p.since ? new Date(str(p.since)).getTime() : now.getTime();
      const days = Math.max(0, Math.floor((now.getTime() - since) / 86_400_000));
      return view({ number: str(p.display_number), status: statusLabel(str(p.status)), days }, p.order_id ? `/orders/${str(p.order_id)}` : (n.link ?? "/orders"));
    }
    case "duplicate_slip_blocked":
      return view({ number: str(p.display_number) }, p.order_id ? `/orders/${str(p.order_id)}` : (n.link ?? "/orders"));
    case "recurring_charges_pending":
      return view({ created: num(p.created), count: num(p.count) }, "/charges");
    default:
      return { kind: "unknown", title: t("unknown.title"), body: t("unknown.body"), href: n.link ?? "/notifications" };
  }
}
