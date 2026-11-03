"use client";

import { useOptimistic, useTransition } from "react";

/** Items shown in their new order immediately while the reorder is saved. */
export function useOptimisticOrder<T extends { id: string }>(items: T[]) {
  const [, startTransition] = useTransition();
  const [ordered, setOrdered] = useOptimistic(items, (_current: T[], ids: string[]) => {
    const byId = new Map(items.map((i) => [i.id, i]));
    return ids.map((id) => byId.get(id)).filter((i): i is T => !!i);
  });
  const reorder = (ids: string[], save: () => Promise<unknown>) =>
    startTransition(async () => {
      setOrdered(ids);
      await save();
    });
  return [ordered, reorder] as const;
}
