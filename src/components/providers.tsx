"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-media-query";

function ResponsiveToaster() {
  const isMobile = useIsMobile();
  return <Toaster position={isMobile ? "top-center" : "bottom-right"} closeButton richColors={false} visibleToasts={4} />;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={250}>
        {children}
        <ResponsiveToaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
