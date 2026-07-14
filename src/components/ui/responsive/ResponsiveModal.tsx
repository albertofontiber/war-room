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
  /**
   * Si el contenido ya pinta su propio botón de cerrar (caso PanelEmpresa),
   * dejarlo en `false` evita duplicar la X. Default `false`.
   */
  showCloseButton?: boolean;
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
  showCloseButton = false,
  children,
}: ResponsiveModalProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={showCloseButton}
        className={cn(
          "bg-wr-surface border-wr-border p-0",
          // Override del `data-[side=right]:w-3/4` que viene del SheetContent.
          // tw-merge no deduplica entre variantes (`data-…:w-3/4` vs `w-screen`)
          // y la variante data- se imprime después en el CSS, por eso ganaba.
          // Usamos la misma variante para que la deduplicación funcione.
          // Mobile/tablet: fullscreen. lg+: ancho fijo definido por consumer.
          "data-[side=right]:w-screen data-[side=right]:h-[100dvh] sm:max-w-none",
          "lg:data-[side=right]:w-[var(--rm-desktop-w)] lg:sm:max-w-[var(--rm-desktop-w)]",
          className,
        )}
        style={{ ["--rm-desktop-w" as string]: `${desktopWidth}px` }}
      >
        <div className="flex flex-1 min-h-0 flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
