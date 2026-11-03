"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-media-query";
import { Link } from "@/i18n/navigation";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";
import { loadMovementHistory } from "../actions";
import type { StockMovement } from "../queries";
import { signed } from "./stock-bits";

export interface DrawerTarget {
  storeId: string;
  categoryId: string;
  categoryName: string;
  locationName: string;
  quantity: number;
}

type History = { movements: StockMovement[]; users: Record<string, string>; truncated: boolean };

/** Every movement of a category at one location, latest first, with the level after each one. */
export function MovementsDrawer({ target, isSuperAdmin, onClose }: { target: DrawerTarget | null; isSuperAdmin: boolean; onClose: () => void }) {
  const t = useTranslations("stock");
  const tc = useTranslations("common");
  const locale = useLocale();
  const f = useFormat();
  const isMobile = useIsMobile();
  const [loaded, setLoaded] = useState<{ key: string; data: History | null } | null>(null);
  const key = target ? `${target.storeId}:${target.categoryId}:${target.quantity}` : null;

  useEffect(() => {
    if (!target || !key) return;
    let live = true;
    void loadMovementHistory({ storeId: target.storeId, categoryId: target.categoryId }).then((r) => {
      if (live) setLoaded({ key, data: r.ok ? r.data : null });
    });
    return () => {
      live = false;
    };
  }, [key, target]);

  const history = loaded?.key === key ? loaded : null;

  const linkFor = (m: StockMovement): { href: string; label: string } | null => {
    if (m.refTable === "orders" && m.refId && m.orderNumber) return { href: `/orders/${m.refId}`, label: t("drawer.openOrder", { number: m.orderNumber }) };
    if (isSuperAdmin && m.refTable === "transfers") return { href: "/stock/transfers", label: tc("open") };
    if (isSuperAdmin && m.refTable === "purchases") return { href: "/purchases", label: tc("open") };
    return null;
  };

  const detail = (m: StockMovement): string | null => {
    if (m.orderNumber) return m.orderNumber;
    if (m.transferStore) return t(m.kind === "transfer_out" ? "drawer.to" : "drawer.from", { location: m.transferStore });
    if (m.reasonLabelFr) return locale === "en" && m.reasonLabelEn ? m.reasonLabelEn : m.reasonLabelFr;
    return null;
  };

  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side={isMobile ? "bottom" : "right"} closeLabel={tc("close")} className={cn("gap-0 p-0", isMobile ? "h-[90dvh] rounded-t-3xl" : "w-full sm:max-w-md")}>
        <SheetHeader className="border-b p-5 pr-12">
          <SheetTitle className="text-lg font-semibold">{target?.categoryName}</SheetTitle>
          <SheetDescription>
            {t("drawer.title")} {target && t("drawer.at", { location: target.locationName })}
          </SheetDescription>
          {target && <p className={cn("num mt-2 text-2xl font-bold", target.quantity <= 0 && "text-destructive")}>{t("drawer.level", { count: target.quantity })}</p>}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto" aria-busy={!history}>
          {!history ? (
            <div className="grid place-items-center p-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-label={tc("loading")} />
            </div>
          ) : !history.data ? (
            <p className="p-5 text-sm text-destructive">{t("drawer.loadFailed")}</p>
          ) : history.data.movements.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">{t("drawer.empty")}</p>
          ) : (
            <>
              <ul className="divide-y">
                {history.data.movements.map((m) => {
                  const link = linkFor(m);
                  const extra = detail(m);
                  const by = m.createdBy ? history.data!.users[m.createdBy] : null;
                  const note = m.kind === "damage" || m.kind === "adjustment" ? m.reason : null;
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                      <span
                        className={cn(
                          "num grid h-9 min-w-12 place-items-center rounded-lg px-2 text-sm font-bold",
                          m.qtyDelta > 0 ? "bg-success/10 text-success-text" : "bg-destructive/10 text-destructive",
                        )}
                      >
                        {signed(m.qtyDelta)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">
                          {t(`kinds.${m.kind}`)}
                          {extra && <span className="num font-normal text-muted-foreground"> · {extra}</span>}
                        </span>
                        <span className="num block truncate text-xs text-muted-foreground">
                          {f.dateTime(m.createdAt)}
                          {by ? ` · ${by}` : ""}
                          {note ? ` · ${note}` : ""}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="num text-xs text-muted-foreground" title={t("drawer.balance")}>
                          = {m.balanceAfter}
                        </span>
                        {link && (
                          <Button asChild variant="ghost" size="icon-sm" aria-label={link.label} title={link.label}>
                            <Link href={link.href}>
                              <ExternalLink />
                            </Link>
                          </Button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {history.data.truncated && <p className="p-5 text-xs text-muted-foreground">{t("drawer.truncated", { count: history.data.movements.length })}</p>}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
