"use client";

import * as React from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface ResponsiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ancho del dialog desktop. Default 560px (igual al PanelEmpresa actual). */
  desktopWidth?: number;
  className?: string;
  children: React.ReactNode;
}

/**
 * Modal que se adapta al viewport:
 *  - `< lg` (≤1023px): fullscreen vertical (cubre el viewport).
 *  - `≥ lg` (≥1024px): dialog lateral derecho con ancho fijo (overlay).
 *
 * Pensado para PanelEmpresa, que en desktop es overlay flotante 560px y
 * en mobile/tablet debe ocupar pantalla completa porque el contenido es denso.
 *
 * Nota: no usa "modal centered" en desktop porque el patrón actual del War
 * Room es un panel lateral; mantenemos esa identidad y solo cambiamos el
 * comportamiento por debajo de lg.
 */
export function ResponsiveModal({
  open,
  onOpenChange,
  desktopWidth = 560,
  className,
  children,
}: ResponsiveModalProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "bg-wr-surface border-wr-border p-0",
          // Mobile/tablet: fullscreen. lg+: ancho fijo definido por consumer.
          "w-screen sm:max-w-none",
          "lg:w-[var(--rm-desktop-w)] lg:sm:max-w-[var(--rm-desktop-w)]",
          className,
        )}
        style={{ ["--rm-desktop-w" as string]: `${desktopWidth}px` }}
      >
        {children}
      </SheetContent>
    </Sheet>
  );
}
