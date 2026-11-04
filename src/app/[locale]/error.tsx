"use client";

import { ErrorState } from "@/components/shared/route-states";

/** The app shell itself failed (session, stores, badges): full-page message. */
export default function LocaleError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorState error={error} retry={retry} className="min-h-dvh" />;
}
