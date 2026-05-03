# Responsive design — guía y decisiones

Estado: foundations creadas (PR feat/responsive-foundations, 2026-05-03). Aplicación de los primitives en PRs sucesivas (shell → vistas → panel → portal → polish).

## Breakpoints

Alineados con los defaults de Tailwind (sin overrides en `tailwind.config.ts`):

| Breakpoint | min-width | Uso típico                                |
|------------|-----------|-------------------------------------------|
| (default)  | <640px    | Mobile puro (375–639). Stack vertical.    |
| `sm`       | ≥640px    | Mobile grande / tablet vertical pequeño.  |
| `md`       | ≥768px    | Tablet vertical (iPad mini ≈768).         |
| `lg`       | ≥1024px   | **Pivot desktop** (iPad Pro horizontal).  |
| `xl`       | ≥1280px   | Desktop estándar.                         |
| `2xl`      | ≥1536px   | Desktop grande.                           |

**Regla:** `lg` es el pivot del War Room. Por debajo aplicamos patrones mobile (drawer, modal fullscreen, bottom sheet); por encima mantenemos el layout desktop nativo (sidebar fijo + panel overlay 560px).

Constants TS espejo en [src/lib/breakpoints.ts](../src/lib/breakpoints.ts) — usar `useBreakpoint("lg")` / `useIsDesktop()` / `useIsMobile()` para decisiones JS-side. Para CSS-only siempre preferir clases responsive de Tailwind.

## Primitives

Todos en `src/components/ui/responsive/`:

- **`<MobileDrawer>`** — Sheet lateral (default left). Usar para Sidebar War Room en `<lg`.
- **`<BottomSheet>`** — Sheet desde abajo. Patrón estándar para filtros mobile (más cómodo de usar con una mano que un drawer lateral). Soporta `footer` sticky.
- **`<ResponsiveModal>`** — fullscreen en `<lg`, panel lateral derecho ancho fijo en `≥lg`. Pensado para PanelEmpresa.

## Touch targets

Utility `.tap-target` (44×44 px) y `.tap-target-h` (solo altura mín). Aplicar a cualquier elemento interactivo que se exponga en mobile. Best practice: Apple HIG 44pt, Material 48dp; tomamos 44px como compromiso.

## Tipografía

El War Room usa abundantemente `text-[10px]` y `text-[11px]` por densidad informacional (kanban, tablas, panel). En mobile esto cae por debajo de WCAG mínimo legible.

**Regla al adaptar componentes:**
- Mantener tamaños actuales para `lg+` (no romper la densidad desktop).
- Subir a `text-xs` (12px) o `text-sm` (14px) por debajo de `lg` con clases responsive: `text-[10px] lg:text-[10px]` → mejor `text-xs lg:text-[10px]`.
- Etiquetas y badges decorativos pueden seguir pequeñas; texto navegable nunca.

## Decisiones estructurales (a aplicar en PRs sucesivas)

1. **Vista por defecto en mobile:** tabla/lista, no mapa. Un mapa con ~5000 pines en 360px no es útil. El switcher de vistas mantiene el mapa accesible bajo demanda.
2. **PanelEmpresa en mobile:** seguir siendo overlay (vía `<ResponsiveModal>`) — evita refactor a ruta nueva, la URL del mapa/tabla mantiene contexto, y el back-button del navegador no se necesita porque hay header con cerrar. Si en uso real aparecen problemas de share/refresh, valoramos pasar a ruta `/empresas/[id]`.
3. **Drawer mobile = navegación + filtros juntos** (revisado en PR shell). El plan inicial era separarlos (drawer para nav, BottomSheet para filtros). Tras implementar, dos drawers añadían fricción sin claro beneficio (los filtros se usan junto con el cambio de vista). El drawer mobile combina ambos en una columna scroll: header → vistas → finders → ajustes (métrica, modo presentación) → filtros (`SidebarContent` reutilizado del desktop). Si en uso real los filtros estorban la nav, los movemos a un BottomSheet aparte.
4. **ChatIA flotante en mobile:** mantener floating action button (FAB) en esquina inferior derecha, pero el panel del chat ocupa pantalla completa al abrirse.

## Cómo extender

- **Nuevo breakpoint custom:** evitar. Si imprescindible, añadirlo en `tailwind.config.ts` `theme.screens` Y en `BREAKPOINTS` de `breakpoints.ts` simultáneamente.
- **Nuevo primitive:** crear en `src/components/ui/responsive/` y reexportar en `index.ts`. Documentarlo aquí.
- **Validación visual:** sin Playwright instalado por ahora. Verificar en Chrome DevTools con devices: iPhone 12 Pro (390×844), Pixel 5 (393×851), iPad Mini (768×1024), iPad Pro (1024×1366), Desktop 1440.
