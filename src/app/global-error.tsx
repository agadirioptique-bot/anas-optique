"use client";

import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import "./globals.css";

/**
 * The root layout itself failed: no next-intl provider here, so the texts come straight from the
 * message files, in the language of the URL.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  const locale = typeof window !== "undefined" && window.location.pathname.startsWith("/en") ? "en" : "fr";
  const t = (locale === "en" ? en : fr).errorPage;
  return (
    <html lang={locale}>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <main role="alert" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <title>OPTICOR</title>
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="text-muted-foreground">{t.body}</p>
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-xl bg-primary px-5 py-2.5 font-medium text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
