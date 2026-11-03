"use client";

import { Bell, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useRouter } from "@/i18n/navigation";
import { visibleNav } from "@/lib/permissions";
import { NAV_ICONS } from "./nav-config";
import { useShell } from "./shell-context";
import { usePalette } from "./ui-store";

/** Ctrl/⌘ K. Phase 1: pages and actions; client/order search (search_global) comes in phase 6. */
export function CommandPalette() {
  const t = useTranslations();
  const open = usePalette((s) => s.open);
  const setOpen = usePalette((s) => s.setOpen);
  const { user } = useShell();
  const router = useRouter();

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

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t("shell.searchShort")}
      description={t("palette.hint")}
      className="top-[12%] translate-y-0 rounded-2xl sm:max-w-xl"
    >
      <Command>
        <CommandInput placeholder={t("palette.placeholder")} />
        <CommandList className="max-h-[60dvh]">
          <CommandEmpty>{t("palette.empty")}</CommandEmpty>
          <CommandGroup heading={t("palette.actions")}>
            <CommandItem value={t("nav.newOrder")} onSelect={() => go("/orders/new")}>
              <Plus />
              {t("nav.newOrder")}
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading={t("palette.pages")}>
            {visibleNav(user.role).map((item) => {
              const Icon = NAV_ICONS[item.key];
              return (
                <CommandItem key={item.key} value={t(`nav.${item.key}`)} onSelect={() => go(item.href)}>
                  <Icon />
                  {t(`nav.${item.key}`)}
                </CommandItem>
              );
            })}
            <CommandItem value={t("nav.notifications")} onSelect={() => go("/notifications")}>
              <Bell />
              {t("nav.notifications")}
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
