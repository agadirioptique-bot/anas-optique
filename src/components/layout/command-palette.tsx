"use client";

import { Bell, FileText, Loader2, Plus, Star, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/shared/badges";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { searchGlobal, type SearchResults } from "@/features/search/actions";
import { useRouter } from "@/i18n/navigation";
import { visibleNav } from "@/lib/permissions";
import { formatPhone } from "@/lib/phone";
import { NAV_ICONS } from "./nav-config";
import { useShell } from "./shell-context";
import { usePalette } from "./ui-store";

const EMPTY: SearchResults = { clients: [], orders: [] };

/** Ctrl/⌘ K: clients and orders (search_global, RLS-scoped), then pages and actions. */
export function CommandPalette() {
  const t = useTranslations();
  const open = usePalette((s) => s.open);
  const setOpen = usePalette((s) => s.setOpen);
  const { user } = useShell();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ q: string; data: SearchResults }>({ q: "", data: EMPTY });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        usePalette.setState((s) => ({ open: !s.open }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Search a moment after typing stops; stale answers are ignored.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let alive = true;
    const timer = setTimeout(async () => {
      const data = await searchGlobal(q);
      if (alive) setResults({ q, data });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  const q = query.trim();
  const searching = q.length >= 2 && results.q !== q;
  const data = q.length >= 2 && results.q === q ? results.data : EMPTY;
  const lower = q.toLowerCase();
  const pages = visibleNav(user.role).filter((item) => !lower || t(`nav.${item.key}`).toLowerCase().includes(lower));
  const showNotifications = !lower || t("nav.notifications").toLowerCase().includes(lower);
  const showNewOrder = !lower || t("nav.newOrder").toLowerCase().includes(lower);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
      title={t("shell.searchShort")}
      description={t("palette.hint")}
      className="top-[12%] translate-y-0 rounded-2xl sm:max-w-xl"
    >
      <Command shouldFilter={false}>
        <CommandInput placeholder={t("palette.placeholder")} value={query} onValueChange={setQuery} data-testid="palette-input" />
        <CommandList className="max-h-[60dvh]">
          {searching ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {t("palette.searching")}
            </div>
          ) : (
            <CommandEmpty>{t("palette.empty")}</CommandEmpty>
          )}
          {data.orders.length > 0 && (
            <CommandGroup heading={t("palette.orders")}>
              {data.orders.map((o) => (
                <CommandItem key={o.id} value={`order-${o.id}`} onSelect={() => go(`/orders/${o.id}`)}>
                  <FileText />
                  <span className="num font-semibold">{o.display_number}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{o.client_name}</span>
                  <StatusBadge status={o.status} />
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {data.clients.length > 0 && (
            <CommandGroup heading={t("palette.clients")}>
              {data.clients.map((c) => (
                <CommandItem key={c.id} value={`client-${c.id}`} onSelect={() => go(`/clients/${c.id}`)}>
                  <UserRound />
                  <span className="min-w-0 flex-1 truncate font-medium">{c.full_name}</span>
                  {c.is_loyal && <Star className="size-3.5 fill-amber-400 text-amber-500" aria-label={t("segment.loyal")} />}
                  <span className="num text-xs text-muted-foreground">{formatPhone(c.phone_e164)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {showNewOrder && (
            <CommandGroup heading={t("palette.actions")}>
              <CommandItem value="new-order" onSelect={() => go("/orders/new")}>
                <Plus />
                {t("nav.newOrder")}
              </CommandItem>
            </CommandGroup>
          )}
          {(pages.length > 0 || showNotifications) && (
            <CommandGroup heading={t("palette.pages")}>
              {pages.map((item) => {
                const Icon = NAV_ICONS[item.key];
                return (
                  <CommandItem key={item.key} value={`page-${item.key}`} onSelect={() => go(item.href)}>
                    <Icon />
                    {t(`nav.${item.key}`)}
                  </CommandItem>
                );
              })}
              {showNotifications && (
                <CommandItem value="page-notifications" onSelect={() => go("/notifications")}>
                  <Bell />
                  {t("nav.notifications")}
                </CommandItem>
              )}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
