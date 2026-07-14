"use client";

import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "left" | "right";
  title?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Drawer lateral para mobile/tablet. Slide-in desde el lado indicado.
 *
 * Uso típico: contenedor del Sidebar del War Room cuando viewport < lg.
 * El consumidor controla `open` (típicamente desde el store o local state)
 * y renderiza el contenido del sidebar dentro como children.
 *
 * El componente añade su propia barra superior con título opcional + botón
 * cerrar (provisto por el primitive Sheet).
 */
export function MobileDrawer({
  open,
  onOpenChange,
  side = "left",
  title,
  className,
  children,
}: MobileDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn(
          "bg-wr-surface border-wr-border p-0 w-[280px] sm:max-w-[320px] data-[side=left]:h-[100dvh] data-[side=right]:h-[100dvh] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
          className,
        )}
      >
        {title && (
          <SheetHeader className="border-b border-wr-border">
            <SheetTitle className="text-wr-text">{title}</SheetTitle>
          </SheetHeader>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
