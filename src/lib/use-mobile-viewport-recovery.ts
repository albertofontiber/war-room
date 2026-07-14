"use client";

import { useCallback, useEffect, useRef } from "react";

const COMPACT_VIEWPORT_QUERY = "(max-width: 1023px)";

/**
 * Safari iOS puede conservar el desplazamiento que aplica para mostrar el
 * teclado incluso despues de cerrar un modal. Llamar a la funcion devuelta
 * justo antes de cerrar una capa que contiene campos editables devuelve la
 * pantalla a su origen y avisa a los consumidores del viewport (Mapbox, etc.).
 */
export function useMobileViewportRecovery() {
  const frameRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const recoverMobileViewport = useCallback(() => {
    if (typeof window === "undefined") return;

    const isCompactViewport =
      typeof window.matchMedia === "function"
        ? window.matchMedia(COMPACT_VIEWPORT_QUERY).matches
        : window.innerWidth < 1024;
    if (!isCompactViewport) return;

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) activeElement.blur();

    const restore = () => {
      window.scrollTo({ left: 0, top: 0, behavior: "auto" });
      window.dispatchEvent(new Event("resize"));
    };

    restore();

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = window.requestAnimationFrame(() => {
      restore();
      frameRef.current = null;
    });

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      restore();
      timerRef.current = null;
    }, 300);
  }, []);

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    []
  );

  return recoverMobileViewport;
}
