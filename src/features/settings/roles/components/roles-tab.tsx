"use client";

import { Check, Lock, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROLES } from "@/lib/permissions";

const DOMAINS = ["page", "scope", "order", "client", "stock", "costs", "settings", "users"] as const;

/** Read-only in v1 (SPEC §3): the table exists so custom roles can be added later. */
export function RolesTab({ permissions }: { permissions: Record<string, string[]> }) {
  const t = useTranslations("settings.roles");
  const tr = useTranslations("roles");
  const tp = useTranslations("perm");
  const all = [...new Set(Object.values(permissions).flat())];
  const label = (key: string) => (tp.has(key as never) ? tp(key as never) : key);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription className="flex items-start gap-2">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t("description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("permission")}</TableHead>
              {ROLES.map((r) => (
                <TableHead key={r} className="w-32 text-center">
                  {tr(r)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {DOMAINS.flatMap((domain) => {
              const keys = all.filter((k) => k.startsWith(`${domain}.`)).sort();
              if (keys.length === 0) return [];
              return [
                <TableRow key={domain} className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={ROLES.length + 1} className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {t(`domains.${domain}`)}
                  </TableCell>
                </TableRow>,
                ...keys.map((key) => (
                  <TableRow key={key}>
                    <TableCell>{label(key)}</TableCell>
                    {ROLES.map((r) => (
                      <TableCell key={r} className="text-center">
                        {permissions[r]?.includes(key) ? (
                          <Check className="mx-auto size-4 text-success-text" aria-label={t("allowed")} />
                        ) : (
                          <Minus className="mx-auto size-4 text-muted-foreground/60" aria-label={t("denied")} />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                )),
              ];
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
