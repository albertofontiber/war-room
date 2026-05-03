"use client";

import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  /** Altura máxima como fracción de viewport (0-1). Default 0.85. */
  maxHeightVh?: number;
  className?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Bottom sheet que sube desde abajo. Patrón mobile estándar para filtros,
 * pickers, acciones rápidas. Más cómodo que un drawer lateral cuando el
 * usuario maneja el dispositivo con una mano.
 *
 * `footer` se renderiza pegado al fondo y no scrollea (ideal para botones
 * "Aplicar" / "Limpiar" en filtros).
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  maxHeightVh = 0.85,
  className,
  footer,
  children,
}: BottomSheetProps) {
  const maxHeight = `${Math.round(maxHeightVh * 100)}vh`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "bg-wr-surface border-wr-border rounded-t-2xl p-0 flex flex-col",
          className,
        )}
        style={{ maxHeight }}
      >
        {/* Handle visual de "drag" (estético, no funcional) */}
        <div className="pt-2 pb-1 flex justify-center flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-wr-border" />
        </div>

        {title && (
          <SheetHeader className="px-4 pb-3 border-b border-wr-border">
            <SheetTitle className="text-wr-text">{title}</SheetTitle>
          </SheetHeader>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">{children}</div>

        {footer && (
          <div className="flex-shrink-0 border-t border-wr-border p-3 bg-wr-surface">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
