"use client";

import { ErrorState } from "@/components/shared/route-states";

export default function AuthError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorState error={error} retry={retry} className="min-h-dvh" />;
}
