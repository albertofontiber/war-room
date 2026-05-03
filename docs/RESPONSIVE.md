# Responsive design — guía y decisiones

Estado: completo (Tech Debt #14). 6 PRs (#64-#69) entre 2026-05-03 y 2026-05-03 que adaptan War Room admin + Portal finders a mobile/tablet/desktop. El uso real revelará los siguientes ajustes.

## PRs aplicados

| PR | Alcance |
|---|---|
| [#64](https://github.com/albertofontiber/war-room/pull/64) foundations | breakpoints constants + hooks + primitives (`<MobileDrawer>`, `<BottomSheet>`, `<ResponsiveModal>`) + tap-target utilities |
| [#65](https://github.com/albertofontiber/war-room/pull/65) shell war room | Sidebar drawer + hamburger Navbar + PanelEmpresa modal en `<lg` |
| [#66](https://github.com/albertofontiber/war-room/pull/66) vistas | TablaEmpresas cards en `<md`, OperacionesBorme scroll horizontal, GruposView stack, MapaEspana leyenda colapsable, KanbanBoard padding mobile, fix drawer-no-cierra-al-cambiar-vista |
| [#67](https://github.com/albertofontiber/war-room/pull/67) PanelEmpresa | padding responsive + CrmSections grid stack + tap targets + regla CSS global anti-zoom iOS |
| [#68](https://github.com/albertofontiber/war-room/pull/68) portal | PortalPipelineClient/TargetClient/ProposeClient padding + grids + tap targets + fix `.input` jsx anti-zoom iOS |
| [#69](https://github.com/albertofontiber/war-room/pull/69) polish | AddLeadModal + LinkLeadModal + FindersAdminClient + ProposalsAdminClient grids/padding/tap targets |

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

**Reglas de pivot:**
- `lg` = pivot principal del War Room shell. Por debajo aplicamos drawer/modal, encima sidebar fijo + overlay 560px.
- `md` = pivot de tabla→cards (TablaEmpresas).
- `sm` = pivot de padding/gap responsive y stack de grids.

Constants TS espejo en [src/lib/breakpoints.ts](../src/lib/breakpoints.ts) — usar `useBreakpoint("lg")` / `useIsDesktop()` / `useIsMobile()` para decisiones JS-side. Para CSS-only siempre preferir clases responsive de Tailwind.

## Primitives

Todos en `src/components/ui/responsive/`:

- **`<MobileDrawer>`** — Sheet lateral (default left). Usar para Sidebar War Room en `<lg`.
- **`<BottomSheet>`** — Sheet desde abajo. Patrón estándar para filtros mobile (más cómodo de usar con una mano que un drawer lateral). Soporta `footer` sticky. **No usado todavía** — disponible si en uso real conviene separar filtros del drawer principal.
- **`<ResponsiveModal>`** — fullscreen en `<lg`, panel lateral derecho ancho fijo en `≥lg`. Usado para PanelEmpresa.

## Touch targets

Utility `.tap-target` (44×44 px) y `.tap-target-h` (solo altura mín). Aplicar a cualquier elemento interactivo que se exponga en mobile. Best practice: Apple HIG 44pt, Material 48dp; tomamos 44px como compromiso.

En la práctica, los botones críticos usan `py-2 sm:py-1` (~36px en mobile) — funciona bien y mantiene la densidad desktop.

## Tipografía

El War Room usa abundantemente `text-[10px]` y `text-[11px]` por densidad informacional. **Se preserva en `lg+`**, y para mobile se compensa con la regla CSS global anti-zoom iOS:

```css
/* globals.css */
@media (max-width: 639px) {
  input, textarea, select { font-size: 16px; }
}
```

Esto evita el zoom-in automático de iOS Safari al focusear cualquier input. **No** sube el font-size del texto plano (sigue text-[10px]/[11px]) — solo inputs.

**Excepción:** componentes con `<style jsx>` definen `.input` propio que escapa la regla global. Hay que duplicar el `font-size: 16px` dentro del `<style jsx>`. PRs #67 y #68 lo hicieron en `PortalProposeClient` y `AddLeadModal`.

## Decisiones estructurales aplicadas

1. **Vista por defecto en mobile**: mantenemos "mapa" (igual que desktop). Auto-cambiar a "tabla" machacaría user choice en cada reload (store es in-memory). Si en uso real molesta, persistir con localStorage.
2. **PanelEmpresa en mobile**: `<ResponsiveModal>` (no ruta nueva). Preserva la URL del mapa/tabla con contexto. Si aparecen problemas (share/refresh), revaloramos pasar a `/empresas/[id]`.
3. **Drawer mobile = navegación + filtros juntos**: en lugar de drawer-nav + bottom-sheet-filtros separados, los unificamos en una columna scroll para reducir fricción. Documentado en `WarRoomMobileMenu.tsx`. Si los filtros estorban a la nav, mover filtros a `<BottomSheet>`.
4. **OperacionesBorme**: scroll horizontal en mobile en lugar de 3 layouts de cards distintos para señales/personas/actividad. Trade-off pragmático.
5. **MapTooltip**: hover-only, no aplica en mobile táctil. Sin cambios.
6. **Tablas admin (Finders)**: `overflow-x-auto` + `min-w` en lugar de cards. Caso de uso interno de baja frecuencia mobile, no merece refactor.

## Cómo extender

- **Nuevo breakpoint custom:** evitar. Si imprescindible, añadirlo en `tailwind.config.ts` `theme.screens` Y en `BREAKPOINTS` de `breakpoints.ts` simultáneamente.
- **Nuevo primitive:** crear en `src/components/ui/responsive/` y reexportar en `index.ts`. Documentarlo aquí.
- **Validación visual:** sin Playwright instalado por ahora. Verificar en Chrome DevTools con devices: iPhone 12 Pro (390×844), Pixel 5 (393×851), iPad Mini (768×1024), iPad Pro (1024×1366), Desktop 1440.

## Items conocidos (low priority)

- **Mapbox terrain crash al unmount**: bug pre-existente en mapbox-gl al cambiar de vista mapa→otra. Solo molesta en dev overlay, prod loggea. Spawn task creado.
- **Zoom inicial mapa**: feedback Alberto, una línea en store. Spawn task creado.
- **MapTooltip overflow** en bordes del mapa en mobile: hover-only, low impact.
