"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const ACTIVE = '[aria-current="page"], [data-state="active"]';

/**
 * Sideways scroller for a row of tabs on a phone: the current tab is scrolled into view and the
 * edge that hides more tabs fades out, so it is clear the row scrolls. The fade is a CSS mask driven
 * by `data-fade` (no React state, no re-render on scroll).
 */
export function ScrollRow({ children, className, activeKey }: { children: ReactNode; className?: string; activeKey?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(ACTIVE);
    if (active) {
      const row = el.getBoundingClientRect();
      const tab = active.getBoundingClientRect();
      if (tab.left < row.left || tab.right > row.right) el.scrollLeft += tab.left - row.left - (row.width - tab.width) / 2;
    }
    const update = () => {
      const left = el.scrollLeft > 4;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      el.dataset.fade = left && right ? "both" : left ? "left" : right ? "right" : "none";
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      resize.disconnect();
    };
  }, [activeKey]);

  return (
    <div
      ref={ref}
      className={cn(
        "overflow-x-auto",
        "data-[fade=both]:[mask-image:linear-gradient(to_right,transparent,black_2rem,black_calc(100%-2rem),transparent)]",
        "data-[fade=left]:[mask-image:linear-gradient(to_right,transparent,black_2rem)]",
        "data-[fade=right]:[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
