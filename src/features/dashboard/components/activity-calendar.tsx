"use client";

import { Flame, TreePalm, type LucideIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { ChartCard, ChartLegend } from "@/components/charts/chart-kit";
import { Button } from "@/components/ui/button";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";
import { calendarColumns, dayLevels, upcomingMonths, viewRange, weekLevel, weekRanges, type ActivityLevel, type CalendarView, type KpiActivity, type WeekRange } from "../activity";

const GAP = 2;
/** Share of the chart colour per level (GitHub-style, 0 = no order). */
const SHADES = [0, 30, 55, 80, 100] as const;
const shade = (level: number) => (level === 0 ? undefined : { background: `color-mix(in oklab, var(--chart-1) ${SHADES[level]}%, transparent)` });

const SEASON_BAR: Record<ActivityLevel, string> = { calm: "bg-success", busy: "bg-attention", normal: "" };
const PILL: Record<ActivityLevel, string> = {
  calm: "border-success/40 bg-success/10 text-success-text",
  busy: "border-attention/40 bg-attention/10 text-attention-text",
  normal: "bg-muted/40 text-muted-foreground",
};

/** Noon UTC: the same calendar day in Casablanca and in any browser. */
const noon = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** Activity calendar (one square per day, darker = more orders) and leave advice (SPEC §9). */
export function ActivityCalendar({ activity }: { activity: KpiActivity }) {
  const t = useTranslations("dashboard.activity");
  const tc = useTranslations("dashboard.charts");
  const format = useFormatter();
  const [view, setView] = useState<CalendarView>("last12");
  const [tip, setTip] = useState<{ d: string; x: number; y: number } | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const byDay = useMemo(() => new Map(activity.days.map((d) => [d.d, d])), [activity.days]);
  const years = useMemo(() => [...new Set(activity.days.map((d) => Number(d.d.slice(0, 4))))].toSorted((a, b) => b - a), [activity.days]);
  const { from, to } = viewRange(view, activity.today);
  const { columns, months } = useMemo(() => calendarColumns(from, to, activity.today), [from, to, activity.today]);
  const shown = activity.days.filter((d) => d.d >= from && d.d <= to);
  const total = shown.reduce((s, d) => s + d.n, 0);
  const level = dayLevels(shown.map((d) => d.n));
  const seasons = columns.map((c) => weekLevel(activity.weeks, c.start));
  const hasAdvice = activity.years.length > 0;

  // Like GitHub, the most recent weeks are in view on a narrow screen.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = view === "last12" || view === Number(activity.today.slice(0, 4)) ? el.scrollWidth : 0;
  }, [view, activity.today]);

  const showTip = (e: PointerEvent<HTMLDivElement>) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-d]");
    const box = wrapper.current?.getBoundingClientRect();
    if (!cell?.dataset.d || !box) return;
    const r = cell.getBoundingClientRect();
    const half = Math.min(110, box.width / 2);
    setTip({ d: cell.dataset.d, x: Math.min(Math.max(r.left + r.width / 2 - box.left, half), box.width - half), y: r.top - box.top });
  };

  const tipDay = tip ? byDay.get(tip.d) : undefined;
  const weekTotal = (days: (string | null)[]) => days.reduce((s, d) => s + (d ? (byDay.get(d)?.n ?? 0) : 0), 0);

  return (
    <ChartCard
      title={t("title")}
      insight={view === "last12" ? t("insightLast12", { count: total }) : t("insightYear", { count: total, year: view })}
      table={{
        columns: [t("weekCol"), t("ordersCol"), t("seasonCol")],
        rows: columns.map((c, i) => [format.dateTime(noon(c.start), { day: "numeric", month: "short", year: "numeric" }), weekTotal(c.days), seasons[i] ? t(`levels.${seasons[i]}`) : "—"]),
      }}
    >
      <div className="flex flex-col gap-3 xl:flex-row-reverse xl:items-start">
        <div role="group" aria-label={t("views")} className="flex flex-wrap gap-1 xl:w-36 xl:shrink-0 xl:flex-col">
          {(["last12", ...years] as CalendarView[]).map((v) => (
            <Button
              key={v}
              type="button"
              size="sm"
              variant={view === v ? "secondary" : "ghost"}
              aria-pressed={view === v}
              className="num xl:justify-start"
              onClick={() => {
                setView(v);
                setTip(null);
              }}
            >
              {v === "last12" ? t("last12") : v}
            </Button>
          ))}
        </div>

        <div ref={wrapper} className="relative min-w-0 flex-1">
          <div
            ref={scroller}
            className="overflow-x-auto rounded-lg pb-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            tabIndex={0}
            onScroll={() => setTip(null)}
            data-testid="activity-calendar"
          >
            <div
              role="img"
              aria-label={t("gridLabel", { count: total })}
              // Square cells that grow with the card (≈ 10–15 px), scrolled sideways on a phone like GitHub.
              className="grid w-full min-w-[620px] max-w-[960px] text-[0.7rem] leading-none text-muted-foreground"
              style={{
                gap: GAP,
                gridTemplateColumns: `auto repeat(${columns.length}, minmax(0, 1fr))`,
                gridTemplateRows: `auto repeat(7, auto)${hasAdvice ? " 5px" : ""}`,
              }}
              onPointerOver={showTip}
              onPointerLeave={() => setTip(null)}
            >
              {months.map((m) => (
                <span key={m.col} className="pb-1 whitespace-nowrap" style={{ gridColumn: m.col + 2, gridRow: 1 }}>
                  {format.dateTime(noon(`2001-${String(m.month).padStart(2, "0")}-15`), { month: "short" })}
                </span>
              ))}
              {([1, 3, 5] as const).map((d) => (
                <span key={d} className="self-center pr-1.5" style={{ gridColumn: 1, gridRow: d + 1 }}>
                  {tc(`weekdays.${d}`)}
                </span>
              ))}
              {columns.flatMap((c, ci) =>
                c.days.map((d, di) => {
                  if (!d) return null;
                  const n = byDay.get(d)?.n ?? 0;
                  return (
                    <span
                      key={d}
                      data-d={d}
                      className={cn("aspect-square rounded-[3px]", n === 0 && "bg-muted/70", tip?.d === d && "ring-1 ring-foreground/60")}
                      style={{ gridColumn: ci + 2, gridRow: di + 2, ...shade(level(n)) }}
                    />
                  );
                }),
              )}
              {hasAdvice &&
                seasons.map((s, ci) => (
                  <span key={`s${ci}`} className={cn("rounded-full", s && SEASON_BAR[s])} style={{ gridColumn: ci + 2, gridRow: 9 }} />
                ))}
            </div>
          </div>

          {tip && (
            <div
              role="tooltip"
              data-testid="activity-tooltip"
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lift"
              style={{ left: tip.x, top: tip.y - 6 }}
            >
              <p className="font-medium text-foreground">
                {t("tooltip", {
                  count: tipDay?.n ?? 0,
                  date: format.dateTime(noon(tip.d), { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
                })}
              </p>
              {tipDay?.legacy && <p className="text-muted-foreground">{t("estimated")}</p>}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {hasAdvice ? (
              <ChartLegend
                items={[
                  { label: t("legendCalm"), color: "var(--success)", kind: "rect" },
                  { label: t("legendBusy"), color: "var(--attention)", kind: "rect" },
                ]}
              />
            ) : (
              <span />
            )}
            <div className="flex items-center gap-1 text-xs text-muted-foreground" aria-hidden="true">
              {t("less")}
              {SHADES.map((_, l) => (
                <span key={l} className={cn("size-3 rounded-[3px]", l === 0 && "bg-muted/70")} style={shade(l)} />
              ))}
              {t("more")}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 border-t pt-4" data-testid="activity-advice">
        {hasAdvice ? <Advice activity={activity} /> : <p className="text-sm text-muted-foreground">{t("notEnough")}</p>}
      </div>
    </ChartCard>
  );
}

function Advice({ activity }: { activity: KpiActivity }) {
  const t = useTranslations("dashboard.activity");
  const f = useFormat();
  const format = useFormatter();
  const months = upcomingMonths(activity.months, activity.today);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section aria-labelledby="activity-by-month">
        <h3 id="activity-by-month" className="text-sm font-semibold">
          {t("byMonth")}
        </h3>
        <p className="text-xs text-muted-foreground">{t("byMonthHint")}</p>
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
          {months.map((m) => (
            <li key={`${m.year}-${m.month}`} className={cn("rounded-xl border px-2.5 py-2", PILL[m.level])} data-level={m.level}>
              <span className="block text-sm font-semibold text-foreground">
                {format.dateTime(noon(`${m.year}-${String(m.month).padStart(2, "0")}-15`), { month: "short", year: "numeric" })}
              </span>
              <span className="num block text-xs">{t("monthValue", { level: t(`levels.${m.level}`), delta: f.delta(m.index - 1) })}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="activity-by-week">
        <h3 id="activity-by-week" className="text-sm font-semibold">
          {t("byWeek")}
        </h3>
        <p className="text-xs text-muted-foreground">{t("byWeekHint")}</p>
        <Ranges icon={TreePalm} title={t("leave")} ranges={weekRanges(activity.upcoming, "calm")} tone="calm" />
        <Ranges icon={Flame} title={t("present")} ranges={weekRanges(activity.upcoming, "busy")} tone="busy" />
      </section>

      <p className="text-xs text-muted-foreground lg:col-span-2">{t("basis", { years: format.list(activity.years.map(String)) })}</p>
    </div>
  );
}

function Ranges({ icon: Icon, title, ranges, tone }: { icon: LucideIcon; title: string; ranges: WeekRange[]; tone: "calm" | "busy" }) {
  const t = useTranslations("dashboard.activity");
  const f = useFormat();
  const format = useFormatter();
  return (
    <div className="mt-3" data-testid={`activity-${tone}`}>
      <p className={cn("flex items-center gap-1.5 text-sm font-medium", tone === "calm" ? "text-success-text" : "text-attention-text")}>
        <Icon className="size-4" aria-hidden="true" />
        {title}
      </p>
      {ranges.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">{t("noRange")}</p>
      ) : (
        <ul className="mt-1.5 space-y-1 text-sm">
          {ranges.map((r) => (
            <li key={r.start} className="num">
              {t("range", {
                range: format.dateTimeRange(noon(r.start), noon(r.end), { day: "numeric", month: "short", year: "numeric" }),
                weeks: r.weeks,
                delta: f.delta(r.index - 1),
              })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
