import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Suspense, type ReactNode } from "react";
import { BrandName, LogoMark } from "@/components/brand/logo";
import { LanguageToggle } from "./language-toggle";

function HeroArt() {
  return (
    <svg viewBox="0 0 420 260" className="w-full max-w-md" aria-hidden="true">
      <defs>
        <linearGradient id="lens" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity=".28" />
          <stop offset="1" stopColor="white" stopOpacity=".06" />
        </linearGradient>
      </defs>
      <g fill="url(#lens)" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" opacity=".95">
        <rect x="46" y="92" width="136" height="104" rx="46" />
        <rect x="238" y="92" width="136" height="104" rx="46" />
      </g>
      <g fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" opacity=".95">
        <path d="M182 128c18-16 38-16 56 0" />
        <path d="M46 120 14 96" />
        <path d="M374 120l32-24" />
      </g>
      <path d="M78 120c10-12 24-18 40-18" stroke="white" strokeOpacity=".7" strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M270 120c10-12 24-18 40-18" stroke="white" strokeOpacity=".7" strokeWidth="6" strokeLinecap="round" fill="none" />
      <g>
        <rect x="248" y="18" width="150" height="52" rx="14" fill="white" />
        <circle cx="272" cy="44" r="9" fill="#E36414" />
        <rect x="290" y="33" width="80" height="8" rx="4" fill="#0F4C5C" opacity=".85" />
        <rect x="290" y="48" width="52" height="7" rx="3.5" fill="#0F4C5C" opacity=".35" />
      </g>
      <g>
        <rect x="22" y="206" width="160" height="46" rx="14" fill="white" />
        <path d="M44 236l8 8 16-18" stroke="#2A9D8F" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="80" y="220" width="84" height="8" rx="4" fill="#0F4C5C" opacity=".85" />
        <rect x="80" y="234" width="56" height="7" rx="3.5" fill="#0F4C5C" opacity=".35" />
      </g>
    </svg>
  );
}

/** Split sign-in layout copied from the demo (hero on lg+, form column with FR/EN switch). */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  const t = useTranslations("auth");
  return (
    <div className="grid grid-cols-1 min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#0f4c5c] p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 size-[28rem] rounded-full bg-[#e36414]/15" />
        <div className="relative flex items-center gap-3">
          <svg viewBox="0 0 40 40" className="size-10" aria-hidden="true">
            <rect width="40" height="40" rx="11" fill="white" fillOpacity=".12" />
            <g fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round">
              <circle cx="13" cy="21.5" r="5.6" />
              <circle cx="27" cy="21.5" r="5.6" />
              <path d="M18.6 20.4c.9-.9 1.9-.9 2.8 0M7.4 20 5.6 15.8M32.6 20l1.8-4.2" />
            </g>
          </svg>
          <span className="font-semibold tracking-[0.18em] uppercase">OPTICOR</span>
        </div>
        <div className="relative space-y-8">
          <HeroArt />
          <h2 className="max-w-lg text-4xl leading-tight font-semibold text-balance">{t("heroTitle")}</h2>
          <ul className="max-w-lg space-y-3 text-white/85">
            {(["heroPoint1", "heroPoint2", "heroPoint3"] as const).map((k) => (
              <li key={k} className="flex gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white/15">
                  <Check className="size-3.5" aria-hidden="true" />
                </span>
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/80">© {new Date().getFullYear()} OPTICOR</p>
      </aside>

      <main className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 lg:invisible">
            <LogoMark className="size-9" />
            <BrandName name="OPTICOR" className="text-sm" />
          </div>
          <Suspense>
            <LanguageToggle />
          </Suspense>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
