import { useFormatter, useLocale, useNow } from "next-intl";
import { useSyncExternalStore } from "react";
import { formatMoney } from "./format";

const noSubscribe = () => () => {};

/**
 * false on the server and during hydration, true once running in the browser.
 * Dates are only formatted in the browser: Node bundles its own (older) time-zone data and can
 * disagree with the OS / Postgres on Africa/Casablanca's offset (tz 2026f: UTC+0), which would
 * show wrong times and break hydration. See SPEC §11.
 */
function useInBrowser(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}

/** Locale-aware display helpers. Dates use the app time zone (Africa/Casablanca, i18n/request.ts), formatted in the browser. */
export function useFormat() {
  const locale = useLocale();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const inBrowser = useInBrowser();
  return {
    money: (amount: number) => formatMoney(amount, locale),
    date: (value: string | Date) => (inBrowser ? format.dateTime(new Date(value), { day: "numeric", month: "short", year: "numeric" }) : ""),
    dateTime: (value: string | Date) =>
      inBrowser ? format.dateTime(new Date(value), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "",
    relative: (value: string | Date) => format.relativeTime(new Date(value), now),
    /** Whole days since a date (time in status, late orders). */
    daysSince: (value: string | Date) => Math.max(0, Math.floor((now.getTime() - new Date(value).getTime()) / 86_400_000)),
  };
}
