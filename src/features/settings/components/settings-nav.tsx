import { Award, Bell, Building2, FormInput, ListChecks, MapPin, Package, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Settings sub-pages (SPEC §8), in display order. */
export const SETTINGS_TABS = ["lists", "products", "fields", "stores", "users", "chargeLocations", "loyalty", "notifications", "roles"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

const ICONS: Record<SettingsTab, LucideIcon> = {
  lists: ListChecks,
  products: Package,
  fields: FormInput,
  stores: Building2,
  users: Users,
  chargeLocations: MapPin,
  loyalty: Award,
  notifications: Bell,
  roles: ShieldCheck,
};

export function isSettingsTab(value: unknown): value is SettingsTab {
  return typeof value === "string" && (SETTINGS_TABS as readonly string[]).includes(value);
}

/** Left sub-nav on desktop, horizontal scroller on phones (demo settings layout). */
export function SettingsNav({ current }: { current: SettingsTab }) {
  const t = useTranslations("settings.tabs");
  return (
    <nav aria-label={t("label")} className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:sticky lg:top-24">
      <ul className="flex w-max gap-1 lg:w-full lg:flex-col">
        {SETTINGS_TABS.map((tab) => {
          const Icon = ICONS[tab];
          const active = tab === current;
          return (
            <li key={tab}>
              <Link
                href={{ pathname: "/settings", query: { tab } }}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground pointer-coarse:h-11 [&_svg]:size-4",
                  active && "bg-card text-foreground shadow-soft",
                )}
              >
                <Icon aria-hidden="true" />
                {t(tab)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
