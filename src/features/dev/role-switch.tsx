"use client";

import { FlaskConical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useShell } from "@/components/layout/shell-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLES } from "@/lib/permissions";
import { setDevRole } from "./actions";

/** Phase 1 only (removed in phase 3): switch the fake signed-in role. */
export function DevRoleSwitch() {
  const t = useTranslations();
  const { user } = useShell();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-full border-dashed border-attention text-attention-text" disabled={pending} data-testid="dev-role-switch">
          <FlaskConical className="size-4" aria-hidden="true" />
          {t("dev.badge")}
          <span className="hidden xl:inline">· {t(`roles.${user.role}`)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-xl">
        <DropdownMenuLabel className="space-y-0.5">
          <p>{t("dev.roleSwitch")}</p>
          <p className="text-xs font-normal text-muted-foreground">{t("dev.roleSwitchHint")}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={user.role}
          onValueChange={(role) =>
            startTransition(async () => {
              await setDevRole(role);
              router.refresh();
            })
          }
        >
          {ROLES.map((role) => (
            <DropdownMenuRadioItem key={role} value={role}>
              {t(`roles.${role}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
