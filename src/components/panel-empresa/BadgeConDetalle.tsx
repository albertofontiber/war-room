"use client";

import type { ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Distintivo de la ficha que esconde un desglose.
 *
 * Lo comparten el de sector (habilitaciones y categorías RIPCI) y el de
 * Cepreven (áreas de calificación), que resumen en una palabra algo que puede
 * tener veinte líneas de detalle.
 *
 * Se abre **con pulsación y también al pasar el ratón**. El hover solo no
 * valía: en un móvil no existe, y el desglose quedaba inalcanzable. Y como el
 * disparador es ahora un botón de verdad —lo pinta base-ui por defecto— ya no
 * hace falta el `<span tabIndex={0}>` que tenía antes para ser alcanzable con
 * teclado, ni el `aria-*` a mano: el Popover lo cablea solo.
 *
 * `inline-flex` porque un botón en línea se apoyaría en la línea base del
 * texto y el distintivo quedaría más bajo que sus vecinos de la fila.
 */
export function BadgeConDetalle({
  distintivo,
  etiqueta,
  anchoMaximo,
  children,
}: {
  /** Lo que se ve siempre en la fila. */
  distintivo: ReactNode;
  /** Qué se abre, para quien navegue a ciegas ("Ver habilitaciones"). */
  etiqueta: string;
  /** Ancho que puede ocupar el desglose en pantalla ancha, en rem. */
  anchoMaximo: number;
  /** El desglose. */
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        // El Popover espera 300 ms antes de abrir con el ratón; el Tooltip que
        // había antes abría al instante. Se mantiene el comportamiento de
        // escritorio, que ya está en uso.
        delay={0}
        aria-label={etiqueta}
        className="inline-flex rounded outline-none focus-visible:ring-1 focus-visible:ring-wr-blue cursor-pointer"
      >
        {distintivo}
      </PopoverTrigger>
      {/* El ancho se pide por prop y no por `className` para que el tope de
          pantalla no dependa de que el llamante se acuerde. Un `max-w-sm`
          suelto son 384px fijos, y hay móviles de 360: el recuadro se salía
          por la derecha. `min()` respeta el ancho cómodo en escritorio y cede
          al viewport cuando no cabe. */}
      <PopoverContent
        side="top"
        className="items-start"
        style={{ maxWidth: `min(${anchoMaximo}rem, calc(100vw - 1.5rem))` }}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
