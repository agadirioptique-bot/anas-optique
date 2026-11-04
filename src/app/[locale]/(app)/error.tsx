"use client";

import { ErrorState } from "@/components/shared/route-states";

/** A page of the app failed: the shell stays, the page area shows retry + home. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorState error={error} retry={retry} />;
}
