"use client";

import { useRef } from "react";

/**
 * Radix dialogs give focus back to their own Trigger on close; ours are opened from state (no
 * Trigger), so focus would fall to <body>. Remember what was focused when the content opens and
 * return there (WCAG 2.4.3), unless the caller handles the auto-focus events itself.
 */
export function useReturnFocus({
  onOpenAutoFocus,
  onCloseAutoFocus,
}: {
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const opener = useRef<Element | null>(null);
  return {
    // Fires on mount, before focus moves into the content: activeElement is still the opener.
    onOpenAutoFocus: (event: Event) => {
      opener.current = document.activeElement;
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus: (event: Event) => {
      onCloseAutoFocus?.(event);
      const el = opener.current;
      opener.current = null;
      if (event.defaultPrevented) return;
      if (el instanceof HTMLElement && el !== document.body && el.isConnected) {
        event.preventDefault();
        el.focus();
      }
    },
  };
}
