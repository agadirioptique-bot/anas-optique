import { Suspense, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CommandPalette } from "./command-palette";
import { MobileNav } from "./mobile-nav";
import { ShellProvider, type ShellValue } from "./shell-context";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/** Signed-in layout: sidebar (desktop), top bar, bottom nav (phones), command palette. */
export function AppShell({ value, children }: { value: ShellValue; children: ReactNode }) {
  const t = useTranslations("nav");
  return (
    <ShellProvider value={value}>
      <div className="flex min-h-dvh">
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          {t("skipToContent")}
        </a>
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Suspense>
            <Topbar />
          </Suspense>
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-5 pb-28 outline-none sm:px-6 md:pt-7 md:pb-12 lg:px-8">
            {children}
          </main>
        </div>
        <MobileNav />
        <CommandPalette />
      </div>
    </ShellProvider>
  );
}
