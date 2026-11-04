"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useOptimistic, useState, useTransition, type KeyboardEventHandler, type PointerEventHandler, type ReactNode } from "react";
import { toast } from "sonner";
import { STATUS_DOT } from "@/components/shared/badges";
import { Link } from "@/i18n/navigation";
import { ORDER_FLOW, type OrderStatus } from "@/lib/orders";
import { cn } from "@/lib/utils";
import type { OrderRow } from "../queries";
import { OrderCard } from "./order-card";
import { nextStatus, previousStatus, useOrderActions } from "./order-actions";

const COLUMN_LIMIT = 40;

function DraggableCard({ row, lateAfter, showStore, canMove, onAdvance }: { row: OrderRow; lateAfter?: number; showStore: boolean; canMove: boolean; onAdvance: () => void }) {
  const t = useTranslations("orders");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: row.id, data: { status: row.status }, disabled: !canMove });
  return (
    <OrderCard
      ref={setNodeRef}
      // Pointer drag from anywhere on the card; keyboard drag from the handle.
      onPointerDown={listeners?.onPointerDown as PointerEventHandler<HTMLDivElement> | undefined}
      handle={
        canMove && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            onKeyDown={listeners?.onKeyDown as KeyboardEventHandler<HTMLButtonElement> | undefined}
            aria-label={t("moveCard", { number: row.displayNumber })}
            className="relative z-10 -my-1 -mr-1 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </button>
        )
      }
      row={row}
      lateAfter={lateAfter}
      showStore={showStore}
      onAdvance={canMove ? onAdvance : undefined}
      className={cn(canMove && "cursor-grab active:cursor-grabbing", isDragging && "opacity-40")}
    />
  );
}

function Column({ status, count, highlight, children }: { status: OrderStatus; count: number; highlight: "valid" | "invalid" | null; children: ReactNode }) {
  const t = useTranslations();
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={t(`status.${status}`)}
      data-testid={`column-${status}`}
      className={cn(
        "flex w-[82vw] max-w-[320px] shrink-0 snap-center flex-col rounded-2xl bg-muted/50 p-2 transition-colors sm:w-72 xl:w-auto xl:max-w-none xl:min-w-[208px] xl:flex-1 xl:shrink",
        highlight === "valid" && "bg-accent outline-2 outline-offset-2 outline-primary/50 outline-dashed",
        highlight === "valid" && isOver && "outline-primary outline-solid",
        highlight === "invalid" && isOver && "outline-2 outline-destructive/40 outline-dashed",
      )}
    >
      <header className="flex items-center gap-2 px-2 pt-1 pb-2.5">
        <span className={cn("size-2.5 rounded-full", STATUS_DOT[status])} aria-hidden="true" />
        <h2 className="text-sm font-semibold">{t(`status.${status}`)}</h2>
        <span className="num ml-auto rounded-full bg-background px-2 py-0.5 text-xs font-semibold text-muted-foreground">{count}</span>
      </header>
      {status === "delivered" && <p className="-mt-1 px-2 pb-2 text-xs text-muted-foreground">{t("orders.deliveredRecent")}</p>}
      <div className="flex min-h-24 flex-1 flex-col gap-2">
        {count === 0 ? <p className="grid flex-1 place-items-center rounded-xl border border-dashed py-6 text-xs text-muted-foreground">{t("orders.columnEmpty")}</p> : children}
      </div>
    </section>
  );
}

/**
 * Five columns (demo). Drag a card to the next column (or back one, super admin); drop on
 * Delivered with a balance due opens the collect dialog. Moves show instantly, then the server
 * data replaces them.
 */
export function OrderBoard({ rows, showStore, showCancelled, stuckDays }: { rows: OrderRow[]; showStore: boolean; showCancelled: boolean; stuckDays: Partial<Record<OrderStatus, number>> }) {
  const t = useTranslations();
  const actions = useOrderActions();
  const [, startTransition] = useTransition();
  const [optimistic, moveOptimistic] = useOptimistic(rows, (current: OrderRow[], move: { id: string; to: OrderStatus }) =>
    current.map((r) => (r.id === move.id ? { ...r, status: move.to, statusSince: new Date().toISOString() } : r)),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const columns = useMemo(() => {
    const statuses: OrderStatus[] = [...ORDER_FLOW, ...(showCancelled ? (["cancelled"] as const) : [])];
    return statuses.map((status) => {
      const list = optimistic.filter((r) => r.status === status);
      // Oldest first while in progress (late ones on top); newest first once finished.
      list.sort((a, b) => (status === "delivered" || status === "cancelled" ? b.statusSince.localeCompare(a.statusSince) : a.statusSince.localeCompare(b.statusSince)));
      return { status, list };
    });
  }, [optimistic, showCancelled]);

  const activeRow = activeId ? optimistic.find((r) => r.id === activeId) : undefined;
  const allowedTargets = (row: OrderRow) => [nextStatus(row.status), actions.isSuperAdmin ? previousStatus(row.status) : null].filter(Boolean) as OrderStatus[];

  const move = (row: OrderRow, to: OrderStatus) => {
    if (to === nextStatus(row.status)) {
      const instant = !(to === "delivered" && row.balance > 0);
      startTransition(async () => {
        if (instant) moveOptimistic({ id: row.id, to });
        await actions.advance(row);
      });
    } else if (to === previousStatus(row.status) && actions.isSuperAdmin) {
      actions.stepBack(row);
    } else {
      toast.error(t("orders.moveOneStep"));
    }
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const to = e.over?.id as OrderStatus | undefined;
    const row = optimistic.find((r) => r.id === e.active.id);
    if (!to || !row || to === row.status) return;
    move(row, to);
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)} accessibility={{ screenReaderInstructions: { draggable: t("orders.dragHint") } }}>
      <p className="mb-3 hidden text-xs text-muted-foreground md:block">{t("orders.dragHint")}</p>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:mx-0 xl:px-0">
        {columns.map(({ status, list }) => (
          <Column key={status} status={status} count={list.length} highlight={activeRow ? (allowedTargets(activeRow).includes(status) ? "valid" : status === activeRow.status ? null : "invalid") : null}>
            {list.slice(0, COLUMN_LIMIT).map((row) => (
              <DraggableCard
                key={row.id}
                row={row}
                lateAfter={stuckDays[row.status]}
                showStore={showStore}
                canMove={allowedTargets(row).length > 0 && row.status !== "cancelled"}
                onAdvance={() => {
                  const next = nextStatus(row.status);
                  if (next) move(row, next);
                }}
              />
            ))}
            {list.length > COLUMN_LIMIT && (
              <Link href={`/orders?view=list&status=${status}`} className="rounded-lg px-2 py-2 text-center text-xs font-medium text-primary hover:underline">
                {t("orders.moreInColumn", { count: list.length - COLUMN_LIMIT })}
              </Link>
            )}
            {status === "delivered" && (
              <Link href="/orders?view=list&status=delivered" className="rounded-lg px-2 py-2 text-center text-xs font-medium text-primary hover:underline">
                {t("orders.seeAllDelivered")}
              </Link>
            )}
          </Column>
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "ease-out" }}>{activeRow ? <OrderCard row={activeRow} showStore={showStore} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}
