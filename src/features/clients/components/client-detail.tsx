"use client";

import { BadgePercent, Loader2, Pencil, Phone, Plus, Star, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, ChartCard, GRID, SERIES, TooltipCard, type TipPayload } from "@/components/charts/chart-kit";
import { ResteBadge, SegmentBadge, StatusBadge, WhatsAppIcon, type ClientSegment } from "@/components/shared/badges";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ConfirmDialog, ResponsiveDialog } from "@/components/shared/dialogs";
import { MoneyInput } from "@/components/shared/money-input";
import { PageHeader, Stat } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettingsAction } from "@/features/settings/use-settings-action";
import { Link, useRouter } from "@/i18n/navigation";
import { formatDiopter } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { useFormat } from "@/lib/use-format";
import { whatsappLink } from "@/lib/whatsapp";
import { clearClientDiscount, setClientDiscount } from "../actions";
import type { ClientFile } from "../queries";
import { ClientFormDialog } from "./client-form-dialog";

type OrderRow = ClientFile["orders"][number];

interface RxPoint {
  at: string;
  label: string;
  sphOd: number | null;
  sphOg: number | null;
  cylOd: number | null;
  cylOg: number | null;
  addOd: number | null;
}

function RxChart({ orders }: { orders: OrderRow[] }) {
  const t = useTranslations("clients");
  const f = useFormat();
  const points = useMemo<RxPoint[]>(
    () =>
      orders
        .filter((o) => o.status !== "cancelled" && (o.re_sph !== null || o.le_sph !== null || o.re_cyl || o.le_cyl))
        .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
        .map((o) => ({
          at: o.created_at!,
          label: f.date(o.created_at!),
          sphOd: o.re_sph,
          sphOg: o.le_sph,
          cylOd: o.re_cyl || null,
          cylOg: o.le_cyl || null,
          addOd: o.re_add,
        })),
    [orders, f],
  );
  const series = [
    { key: "sphOd", label: t("rxSeries.sphOd"), color: SERIES[0], dashed: false },
    { key: "sphOg", label: t("rxSeries.sphOg"), color: SERIES[1], dashed: false },
    { key: "cylOd", label: t("rxSeries.cylOd"), color: SERIES[0], dashed: true },
    { key: "cylOg", label: t("rxSeries.cylOg"), color: SERIES[1], dashed: true },
  ] as const;
  const present = series.filter((s) => points.some((p) => p[s.key] !== null));

  const first = points.find((p) => p.sphOd !== null);
  const last = [...points].reverse().find((p) => p.sphOd !== null);
  const delta = first && last ? (last.sphOd ?? 0) - (first.sphOd ?? 0) : 0;
  const insight =
    points.length < 2 || !first ? undefined : Math.abs(delta) < 0.25 ? t("rxInsightStable") : t("rxInsightChange", { delta: formatDiopter(delta), date: f.date(first.at) });

  if (points.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("rxTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("noRx")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ChartCard
      className="xl:self-start"
      title={t("rxTitle")}
      insight={insight ?? t("rxHint")}
      legend={present.map((s) => ({ label: s.label, color: s.color, kind: s.dashed ? "dashed" : "line" }))}
      table={{
        columns: [t("rxDate"), ...present.map((s) => s.label), "ADD"],
        rows: points.map((p) => [f.date(p.at), ...present.map((s) => formatDiopter(p[s.key])), formatDiopter(p.addOd)]),
      }}
    >
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => formatDiopter(v)} domain={["auto", "auto"]} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipCard
                    title={label}
                    rows={(payload as readonly TipPayload[]).map((p) => {
                      const s = series.find((x) => x.key === p.dataKey)!;
                      return { name: s.label, value: formatDiopter(Number(p.value)), color: s.color, dashed: s.dashed };
                    })}
                  />
                ) : null
              }
            />
            {present.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? "5 4" : undefined}
                dot={{ r: 4, strokeWidth: 2, fill: "var(--card)" }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)", fill: s.color }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function DiscountDialog({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const t = useTranslations("clients.discount");
  const tc = useTranslations("common");
  const run = useSettingsAction();
  const [type, setType] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState<number | undefined>(10);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const valid = value !== undefined && value > 0 && (type === "amount" || value <= 100);
  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            disabled={!valid || pending}
            onClick={async () => {
              setPending(true);
              const done = await run(() => setClientDiscount({ clientId, type, value, note }), t("saved"));
              setPending(false);
              if (done) onClose();
            }}
          >
            {pending && <Loader2 className="animate-spin" />}
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ChoiceChips
          label={t("type")}
          value={type}
          onChange={(v) => setType(v as "percent" | "amount")}
          options={[
            { value: "percent", label: t("percent") },
            { value: "amount", label: t("amount") },
          ]}
        />
        <div className="space-y-2">
          <Label htmlFor="disc-value">{t("value")}</Label>
          {type === "amount" ? (
            <MoneyInput id="disc-value" value={value} onChange={setValue} />
          ) : (
            <div className="flex items-center gap-2">
              <Input
                id="disc-value"
                inputMode="numeric"
                className="num w-24 text-center"
                value={value ?? ""}
                onChange={(e) => {
                  const n = parseInt(e.target.value.replace(/\D/g, "").slice(0, 3), 10);
                  setValue(Number.isNaN(n) ? undefined : n);
                }}
              />
              <span className="text-muted-foreground">%</span>
            </div>
          )}
          {!valid && value !== undefined && <p className="text-sm text-destructive">{t("invalid")}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="disc-note">{t("note")}</Label>
          <Input id="disc-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} />
        </div>
      </div>
    </ResponsiveDialog>
  );
}

export function ClientDetail({ file, isSuperAdmin, ownStoreId }: { file: ClientFile; isSuperAdmin: boolean; ownStoreId: string | null }) {
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const run = useSettingsAction();
  const { client, stats, orders } = file;
  const [editOpen, setEditOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const segment: ClientSegment = client.is_loyal ? "loyal" : stats.orders <= 1 ? "new" : "regular";
  const hiddenOrders = Math.max(0, stats.orders - orders.filter((o) => o.status !== "cancelled").length);
  const discountLabel =
    client.pending_discount_type === "percent" ? `${client.pending_discount_value} %` : client.pending_discount_value ? f.money(client.pending_discount_value) : "";

  const columns: Column<OrderRow>[] = [
    {
      id: "number",
      header: t("orders.number"),
      cell: (o) => (
        <Link href={`/orders/${o.id}`} className="num font-semibold text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {o.display_number}
        </Link>
      ),
    },
    { id: "date", header: t("orders.columns.date"), sortValue: (o) => o.created_at ?? "", cell: (o) => <span className="num text-muted-foreground">{f.date(o.created_at!)}</span> },
    { id: "location", header: t("orders.columns.location"), cell: (o) => o.store_name, hideBelow: "lg" },
    { id: "status", header: t("orders.columns.status"), cell: (o) => <StatusBadge status={o.status!} /> },
    { id: "total", header: t("orders.columns.total"), align: "right", cell: (o) => <span className="num font-medium">{f.money(o.total ?? 0)}</span> },
    { id: "reste", header: t("orders.columns.reste"), align: "right", cell: (o) => (o.status === "cancelled" ? "—" : <ResteBadge reste={o.balance ?? 0} compact />) },
  ];

  return (
    <>
      <PageHeader
        backHref="/clients"
        title={client.full_name}
        description={stats.first_order_at ? t("clients.firstOrder", { date: f.date(stats.first_order_at) }) : t("clients.since", { date: f.date(client.created_at) })}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil />
              {t("clients.edit")}
            </Button>
            <Button asChild>
              <Link href={`/orders/new?client=${client.id}`}>
                <Plus />
                {t("clients.newOrderFor")}
              </Link>
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <SegmentBadge segment={segment} />
          {client.phone_e164 ? (
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <a href={`tel:${client.phone_e164}`} aria-label={`${t("clients.call")} ${formatPhone(client.phone_e164)}`}>
                <Phone />
                <span className="num">{formatPhone(client.phone_e164)}</span>
              </a>
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">{t("clients.noPhone")}</span>
          )}
          {client.has_whatsapp && client.phone_e164 && (
            <Button asChild variant="outline" size="sm" className="rounded-full text-whatsapp-text">
              <a href={whatsappLink(client.phone_e164, `Bonjour ${client.full_name},`)} target="_blank" rel="noopener noreferrer">
                <WhatsAppIcon />
                {t("clients.whatsappChat")}
              </a>
            </Button>
          )}
        </div>
      </PageHeader>

      {client.is_loyal && client.loyal_since && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
          <Star className="size-4 fill-current" aria-hidden="true" />
          {t("clients.loyalSince", { date: f.date(client.loyal_since) })}
        </p>
      )}

      {(client.pending_discount_type || isSuperAdmin) && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-sm">
          <BadgePercent className="size-5 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {client.pending_discount_type ? (
              <>
                <span className="font-medium">{t("clients.discount.pending", { value: discountLabel })}</span>
                {client.pending_discount_note && <span className="text-muted-foreground"> · {client.pending_discount_note}</span>}
              </>
            ) : (
              <span className="text-muted-foreground">{t("clients.discount.none")}</span>
            )}
          </span>
          {isSuperAdmin && (
            <>
              {client.pending_discount_type && (
                <Button variant="ghost" size="sm" onClick={() => setClearing(true)}>
                  <X />
                  {t("clients.discount.clear")}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setDiscountOpen(true)}>
                {client.pending_discount_type ? t("clients.discount.change") : t("clients.discount.set")}
              </Button>
            </>
          )}
        </div>
      )}

      <Card className="mb-6">
        <CardContent className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <Stat label={t("clients.kpis.orders")} value={stats.orders} hint={stats.stores > 1 ? t("clients.inStores", { count: stats.stores }) : undefined} />
          <Stat label={t("clients.kpis.delivered")} value={stats.delivered} hint={client.is_loyal ? undefined : t("clients.toLoyal", { count: Math.max(0, file.loyaltyThreshold - stats.delivered) })} />
          {isSuperAdmin && stats.spent !== null ? (
            <Stat label={t("clients.kpis.spent")} value={f.money(stats.spent)} />
          ) : (
            <Stat label={t("clients.kpis.firstOrder")} value={stats.first_order_at ? f.date(stats.first_order_at) : "—"} />
          )}
          <Stat label={t("clients.kpis.lastVisit")} value={stats.last_order_at ? f.date(stats.last_order_at) : "—"} hint={stats.last_order_at ? f.relative(stats.last_order_at) : undefined} />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <RxChart orders={orders} />
        <Card className="py-0">
          <CardHeader className="pt-5">
            <CardTitle>{t("clients.ordersTitle")}</CardTitle>
          </CardHeader>
          <DataTable
            rows={orders}
            columns={columns}
            rowKey={(o) => o.id!}
            initialSort={{ id: "date", desc: true }}
            pageSize={8}
            onRowClick={(o) => router.push(`/orders/${o.id}`)}
            empty={<p className="px-5 pb-5 text-sm text-muted-foreground">{t("clients.noOrders")}</p>}
            mobileCard={(o) => (
              <Link href={`/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="num block font-semibold text-primary">
                    {o.display_number} <span className="text-xs font-normal text-muted-foreground">{f.date(o.created_at!)}</span>
                  </span>
                  <StatusBadge status={o.status!} className="mt-1" />
                </span>
                <span className="num font-medium">{f.money(o.total ?? 0)}</span>
              </Link>
            )}
          />
          {!isSuperAdmin && ownStoreId && hiddenOrders > 0 && <p className="px-5 pb-5 text-sm text-muted-foreground">{t("clients.otherStoresOrders", { count: hiddenOrders })}</p>}
        </Card>
      </div>
      <ClientFormDialog open={editOpen} onOpenChange={setEditOpen} client={client} onSaved={() => router.refresh()} />
      {discountOpen && <DiscountDialog clientId={client.id} onClose={() => setDiscountOpen(false)} />}
      <ConfirmDialog
        open={clearing}
        onOpenChange={setClearing}
        title={t("clients.discount.clearTitle")}
        description={t("clients.discount.clearBody")}
        confirmLabel={t("clients.discount.clear")}
        onConfirm={async () => {
          await run(() => clearClientDiscount(client.id), t("clients.discount.cleared"));
        }}
      />
    </>
  );
}
