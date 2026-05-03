import { useEffect, useState } from "react";

// Breakpoints alineados con Tailwind defaults (sm/md/lg/xl/2xl).
// Mantener sincronizado con tailwind.config.ts si se cambian.
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

// `lg` es el pivot del War Room: por debajo es tablet/mobile (drawer + modal),
// por encima es el layout desktop nativo (sidebar fijo + panel overlay).
export const DESKTOP_BREAKPOINT: Breakpoint = "lg";

/**
 * Hook que devuelve si el viewport está por encima del breakpoint dado.
 * SSR-safe: arranca en `false` y se hidrata en el primer effect.
 *
 * Usar para decisiones JS-side (ej. "vista por defecto en mobile = tabla").
 * Para CSS-only, preferir clases responsive de Tailwind (`lg:hidden`, etc.).
 */
export function useBreakpoint(bp: Breakpoint = DESKTOP_BREAKPOINT): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${BREAKPOINTS[bp]}px)`);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [bp]);

  return matches;
}

/** Atajo: `useIsDesktop()` ≡ `useBreakpoint("lg")`. */
export function useIsDesktop(): boolean {
  return useBreakpoint(DESKTOP_BREAKPOINT);
}

/** Atajo: `useIsMobile()` ≡ viewport < sm (640px). */
export function useIsMobile(): boolean {
  return !useBreakpoint("sm");
}
