"use client";

import { Languages, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setDevRole } from "@/features/dev/actions";
import { useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { initials } from "@/lib/format";
import { useShell } from "./shell-context";
import { useSwitchLocale } from "./use-switch-locale";

export function UserMenu() {
  const t = useTranslations();
  const { user, stores } = useShell();
  const locale = useLocale();
  const switchLocale = useSwitchLocale();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const store = stores.find((s) => s.id === user.storeId);

  const signOut = async () => {
    // Phase 3: supabase.auth.signOut(). Phase 1: clear the fake session.
    await setDevRole("signed_out");
    router.replace("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label={t("shell.userMenu")}>
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">{initials(user.fullName)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 rounded-xl">
        <DropdownMenuLabel className="space-y-0.5 py-2">
          <p className="truncate font-semibold">{user.fullName}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">
            {t(`roles.${user.role}`)} · {store ? store.name : t("shell.noLocation")}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <Languages className="size-4" />
            {t("shell.language")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={locale} onValueChange={(v) => switchLocale(v as AppLocale)}>
              <DropdownMenuRadioItem value="fr">Français</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            {theme === "dark" ? <Moon className="size-4" /> : theme === "system" ? <Monitor className="size-4" /> : <Sun className="size-4" />}
            {t("shell.theme")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">{t("shell.themeLight")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">{t("shell.themeDark")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">{t("shell.themeSystem")}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()} className="gap-2">
          <LogOut className="size-4" />
          {t("shell.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
