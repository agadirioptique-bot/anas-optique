"use client";

import { useLocale, useTranslations } from "next-intl";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, ChartCard, GRID, MUTED_SERIES, SERIES, TooltipCard, type TipPayload } from "@/components/charts/chart-kit";
import { useIsMobile } from "@/hooks/use-media-query";
import { localized } from "@/lib/localized";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";
import { percentDelta } from "../periods";
import type { KpiBreakdown, KpiSeries, KpiSummary } from "../queries";
import { Delta } from "./kpis";

/** "09 h" / "4 nov." / "nov. 2026" from a bucket key (UTC, so it never shifts a day). */
export function useBucketLabel(bucket: KpiSeries["bucket"]) {
  const locale = useLocale();
  const t = useTranslations("dashboard.charts");
  const lang = locale === "en" ? "en-GB" : "fr-FR";
  return (at: string) => {
    if (bucket === "hour") return t("hour", { hour: at });
    if (bucket === "day") return new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${at}T12:00:00Z`));
    return new Intl.DateTimeFormat(lang, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${at}-15T12:00:00Z`));
  };
}

function Empty() {
  const t = useTranslations("dashboard.charts");
  return <p className="grid h-40 place-items-center text-sm text-muted-foreground">{t("empty")}</p>;
}

// ─── Revenue over time vs comparison ─────────────────────────────────────────

export function RevenueChart({
  series,
  previousSeries,
  summary,
  previousSummary,
  period,
}: {
  series: KpiSeries;
  previousSeries: KpiSeries | null;
  summary: KpiSummary;
  previousSummary: KpiSummary | null;
  period: string;
}) {
  const t = useTranslations("dashboard");
  const f = useFormat();
  const label = useBucketLabel(series.bucket);
  const rows = series.points.map((p, i) => {
    const prev = previousSeries?.points[i];
    return { label: label(p.at), current: p.revenue, previous: prev ? prev.revenue : null, prevLabel: prev ? label(prev.at) : "" };
  });
  const best = rows.reduce<(typeof rows)[number] | null>((m, r) => (!m || r.current > m.current ? r : m), null);
  const delta = previousSummary ? percentDelta(summary.revenue, previousSummary.revenue) : null;
  const insight =
    summary.revenue === 0
      ? t("charts.empty")
      : `${delta !== null && period ? t("insights.revenueUp", { amount: f.money(summary.revenue), delta: f.delta(delta), period }) : t("insights.revenueFlat", { amount: f.money(summary.revenue) })}${
          best && best.current > 0 && rows.length > 2 ? ` ${t("insights.best", { label: best.label, amount: f.money(best.current) })}` : ""
        }`;
  return (
    <ChartCard
      title={t("charts.revenue")}
      insight={insight}
      legend={[
        { label: t("charts.current"), color: SERIES[0], kind: "line" },
        ...(previousSeries ? [{ label: t("charts.comparison", { period }), color: MUTED_SERIES, kind: "dashed" as const }] : []),
      ]}
      table={{
        columns: [t("charts.current"), t("kpis.revenue"), ...(previousSeries ? [t("charts.comparison", { period })] : [])],
        rows: rows.map((r) => [r.label, f.money(r.current), ...(previousSeries ? [r.previous === null ? "—" : f.money(r.previous)] : [])]),
      }}
    >
      <div className="h-72" data-testid="chart-revenue">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={20} interval="preserveStartEnd" />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => f.moneyCompact(v)} />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = (payload as readonly TipPayload[])[0].payload as (typeof rows)[number];
                const d = row.previous ? percentDelta(row.current, row.previous) : null;
                return (
                  <TooltipCard
                    title={
                      <span className="flex items-center gap-2">
                        {row.label}
                        {d !== null && <Delta delta={d} />}
                      </span>
                    }
                    rows={[
                      { name: t("charts.current"), value: f.money(row.current), color: SERIES[0] },
                      ...(row.previous !== null ? [{ name: `${row.prevLabel} (${period})`, value: f.money(row.previous), color: MUTED_SERIES, dashed: true }] : []),
                    ]}
                  />
                );
              }}
            />
            {previousSeries && <Line dataKey="previous" stroke={MUTED_SERIES} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} connectNulls />}
            <Area
              dataKey="current"
              type="monotone"
              stroke={SERIES[0]}
              strokeWidth={2}
              fill="url(#rev-fill)"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)", fill: SERIES[0] }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

// ─── CA & NET by store ───────────────────────────────────────────────────────

/** Store name cut to fit its room (≈ 7 px per character at 12 px), full name on hover. */
const shortName = (name: string, room: number) => {
  const max = Math.max(4, Math.floor(room / 7));
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
};

interface TickProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  visibleTicksCount?: number;
  payload?: { value: string };
}

/** Phone (horizontal bars): names on the left axis, 112 px wide. */
function StoreTickLeft({ x, y, payload }: TickProps) {
  const name = payload?.value ?? "";
  return (
    <text x={Number(x)} y={Number(y)} dy={4} textAnchor="end" fontSize={AXIS_TICK.fontSize} fill={AXIS_TICK.fill}>
      <title>{name}</title>
      {shortName(name, 84)}
    </text>
  );
}

/** Desktop (vertical bars): names under the bars, cut to the width of one store's band. */
function StoreTickBottom({ x, y, width, visibleTicksCount, payload }: TickProps) {
  const name = payload?.value ?? "";
  const band = Number(width) / Math.max(1, visibleTicksCount ?? 1);
  return (
    <text x={Number(x)} y={Number(y)} dy="0.71em" textAnchor="middle" fontSize={AXIS_TICK.fontSize} fill={AXIS_TICK.fill}>
      <title>{name}</title>
      {Number.isFinite(band) && band > 0 ? shortName(name, band - 8) : name}
    </text>
  );
}

export function StoresChart({ breakdown }: { breakdown: KpiBreakdown }) {
  const t = useTranslations("dashboard.charts");
  const f = useFormat();
  // On a phone the store names don't fit under vertical bars: one horizontal row per store instead.
  const mobile = useIsMobile();
  const rows = breakdown.stores.map((s) => ({ ...s, label: s.name }));
  const hasData = rows.some((r) => r.revenue !== 0 || r.charges !== 0);
  return (
    <ChartCard
      title={t("stores")}
      insight={breakdown.general_charges !== null && breakdown.general_charges > 0 ? t("generalCharges", { amount: f.money(breakdown.general_charges) }) : undefined}
      legend={[
        { label: t("revenueCol"), color: SERIES[0], kind: "rect" },
        { label: t("netCol"), color: SERIES[1], kind: "rect" },
      ]}
      table={{
        columns: [t("storeCol"), t("revenueCol"), t("collectedCol"), t("chargesCol"), t("netCol"), t("ordersCol")],
        rows: rows.map((r) => [r.name, f.money(r.revenue), f.money(r.collected), f.money(r.charges), f.money(r.net), r.orders]),
      }}
    >
      {!hasData ? (
        <Empty />
      ) : (
        <div className={mobile ? undefined : "h-72"} style={mobile ? { height: 48 + rows.length * 52 } : undefined} data-testid="chart-stores">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout={mobile ? "vertical" : "horizontal"} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={mobile ? 2 : 4}>
              <CartesianGrid stroke={GRID} vertical={mobile} horizontal={!mobile} />
              {mobile ? (
                <>
                  <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} tickCount={4} tickFormatter={(v: number) => f.moneyCompact(v)} />
                  <YAxis type="category" dataKey="label" tick={<StoreTickLeft />} tickLine={false} axisLine={false} width={112} interval={0} />
                </>
              ) : (
                <>
                  <XAxis dataKey="label" tick={<StoreTickBottom />} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => f.moneyCompact(v)} />
                </>
              )}
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = (payload as readonly TipPayload[])[0].payload as (typeof rows)[number];
                  return (
                    <TooltipCard
                      title={row.name}
                      rows={[
                        { name: t("revenueCol"), value: f.money(row.revenue), color: SERIES[0] },
                        { name: t("collectedCol"), value: f.money(row.collected) },
                        { name: t("chargesCol"), value: f.money(row.charges) },
                        { name: t("netCol"), value: f.money(row.net), color: SERIES[1] },
                      ]}
                    />
                  );
                }}
              />
              <Bar dataKey="revenue" fill={SERIES[0]} radius={mobile ? [0, 4, 4, 0] : [4, 4, 0, 0]} isAnimationActive={false} maxBarSize={mobile ? 16 : 40} />
              <Bar dataKey="net" fill={SERIES[1]} radius={mobile ? [0, 4, 4, 0] : [4, 4, 0, 0]} isAnimationActive={false} maxBarSize={mobile ? 16 : 40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

// ─── Client segments ─────────────────────────────────────────────────────────

export function SegmentsChart({ breakdown, served }: { breakdown: KpiBreakdown; served: number }) {
  const t = useTranslations();
  const f = useFormat();
  const keys = ["new", "regular", "loyal"] as const;
  const rows = keys.map((k, i) => ({ key: k, name: t(`segment.${k}`), value: breakdown.segments[k], color: SERIES[i] }));
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <ChartCard
      title={t("dashboard.charts.segments")}
      insight={t("dashboard.charts.segmentsInsight", { served, threshold: breakdown.loyalty_threshold })}
      legend={rows.map((r) => ({ label: `${r.name} · ${r.value}`, color: r.color, kind: "rect" as const }))}
      table={{ columns: [t("dashboard.charts.segments"), "#", "%"], rows: rows.map((r) => [r.name, r.value, total ? f.percent(r.value / total) : "—"]) }}
    >
      {total === 0 ? (
        <Empty />
      ) : (
        <div className="h-60" data-testid="chart-segments">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={rows} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={2} isAnimationActive={false} stroke="var(--card)">
                {rows.map((r) => (
                  <Cell key={r.key} fill={r.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = (payload as readonly TipPayload[])[0].payload as (typeof rows)[number];
                  return <TooltipCard rows={[{ name: row.name, value: `${row.value} · ${f.percent(row.value / total)}`, color: row.color }]} />;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

// ─── Sales mix: frame categories, treatments, lens types ────────────────────

function BarList({ title, rows, valueLabel }: { title: string; rows: { name: string; value: number; extra?: string }[]; valueLabel: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.name} className="space-y-0.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{r.name}</span>
                <span className="num shrink-0 text-xs text-muted-foreground">
                  {valueLabel(r.value)}
                  {r.extra && ` · ${r.extra}`}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${(r.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SalesMix({ breakdown }: { breakdown: KpiBreakdown }) {
  const t = useTranslations("dashboard.charts");
  const locale = useLocale();
  const f = useFormat();
  return (
    <ChartCard
      title={t("sales")}
      insight={t("ownFrames", { count: breakdown.own_frames })}
      table={{
        columns: [t("sales"), "#", t("revenueCol")],
        rows: [
          ...breakdown.frame_categories.map((c) => [c.name, c.count, f.money(c.revenue)]),
          ...breakdown.treatments.map((c) => [localized(c, locale), c.count, "—"]),
          ...breakdown.lens_types.map((c) => [localized(c, locale), c.count, "—"]),
        ],
      }}
    >
      <div className="space-y-5" data-testid="chart-sales">
        <BarList
          title={t("frames")}
          rows={breakdown.frame_categories.slice(0, 5).map((c) => ({ name: c.name, value: c.revenue, extra: `× ${c.count}` }))}
          valueLabel={(v) => f.money(v)}
        />
        <BarList title={t("treatments")} rows={breakdown.treatments.slice(0, 5).map((c) => ({ name: localized(c, locale), value: c.count }))} valueLabel={(v) => String(v)} />
        <BarList title={t("lensTypes")} rows={breakdown.lens_types.slice(0, 5).map((c) => ({ name: localized(c, locale), value: c.count }))} valueLabel={(v) => String(v)} />
      </div>
    </ChartCard>
  );
}

// ─── Busiest hours ───────────────────────────────────────────────────────────

export function HeatmapChart({ breakdown }: { breakdown: KpiBreakdown }) {
  const t = useTranslations("dashboard.charts");
  const cells = new Map(breakdown.heatmap.map((c) => [`${c.dow}-${c.hour}`, c.orders]));
  const hours = breakdown.heatmap.map((c) => c.hour);
  const from = Math.min(9, ...hours);
  const to = Math.max(19, ...hours);
  const range = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const max = Math.max(1, ...breakdown.heatmap.map((c) => c.orders));
  const days = [1, 2, 3, 4, 5, 6, 7] as const;
  return (
    <ChartCard
      title={t("heatmap")}
      insight={t("heatmapInsight")}
      table={{
        columns: ["", ...range.map((h) => t("hour", { hour: String(h).padStart(2, "0") }))],
        rows: days.map((d) => [t(`weekdays.${d}`), ...range.map((h) => cells.get(`${d}-${h}`) ?? 0)]),
      }}
    >
      {breakdown.heatmap.length === 0 ? (
        <Empty />
      ) : (
        <div className="overflow-x-auto rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50" tabIndex={0} data-testid="chart-heatmap">
          {/* Fixed layout: on a phone the cells shrink to fit (no hidden hours on the right). */}
          <table className="w-full table-fixed border-separate border-spacing-0.5 text-xs">
            <thead>
              <tr>
                <th className="w-9 sm:w-10" />
                {range.map((h) => (
                  <th key={h} scope="col" className="num overflow-visible px-0 text-center font-normal whitespace-nowrap text-muted-foreground sm:px-0.5">
                    {h % 2 === 0 ? h : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d}>
                  <th scope="row" className="pr-1 text-left font-normal text-muted-foreground">
                    {t(`weekdays.${d}`)}
                  </th>
                  {range.map((h) => {
                    const v = cells.get(`${d}-${h}`) ?? 0;
                    return (
                      <td
                        key={h}
                        title={`${t(`weekdays.${d}`)} ${t("hour", { hour: String(h).padStart(2, "0") })} · ${v}`}
                        className={cn("h-6 rounded-[4px] sm:min-w-5", v === 0 && "bg-muted/60")}
                        style={v ? { background: `color-mix(in oklab, var(--chart-1) ${20 + (v / max) * 80}%, transparent)` } : undefined}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}

// ─── Workshop lead times ─────────────────────────────────────────────────────

export function LeadTimesChart({ breakdown }: { breakdown: KpiBreakdown }) {
  const t = useTranslations("dashboard.charts");
  const f = useFormat();
  const rows = breakdown.lead_times;
  const max = Math.max(1, ...rows.flatMap((r) => [r.to_in_store ?? 0, r.to_delivered ?? 0]));
  const days = (v: number | null) => (v === null ? "—" : t("days", { value: f.number(v, 1) }));
  return (
    <ChartCard
      title={t("leadTimes")}
      insight={t("leadInsight")}
      legend={[
        { label: t("toInStore"), color: SERIES[0], kind: "rect" },
        { label: t("toDelivered"), color: SERIES[2], kind: "rect" },
      ]}
      table={{ columns: [t("storeCol"), t("toInStore"), t("toDelivered")], rows: rows.map((r) => [r.name, days(r.to_in_store), days(r.to_delivered)]) }}
    >
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-3" data-testid="chart-lead">
          {rows.map((r) => (
            <li key={r.name} className="space-y-1">
              <p className="text-sm font-medium">{r.name}</p>
              {[
                { v: r.to_in_store, color: SERIES[0], label: t("toInStore") },
                { v: r.to_delivered, color: SERIES[2], label: t("toDelivered") },
              ].map((bar) => (
                <div key={bar.label} className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div className="h-full rounded-full" style={{ width: `${((bar.v ?? 0) / max) * 100}%`, background: bar.color }} />
                  </div>
                  <span className="num w-24 shrink-0 text-right text-xs text-muted-foreground">
                    <span className="sr-only">{bar.label} </span>
                    {days(bar.v)}
                  </span>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
