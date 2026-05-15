/**
 * Tests del bus de invalidación `wr:data-changed`. Cubre:
 *   - dispatch + subscribe básico
 *   - filtro por resource (un suscriptor solo recibe los suyos)
 *   - filtro por parent (entidades anidadas — tarea bajo empresa concreta)
 *   - filtro por action y resourceId
 *   - unsubscribe correcto
 *   - múltiples suscriptores simultáneos no interfieren
 *   - SSR safety (typeof window === undefined no rompe)
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Vitest corre por default en environment "node" (ver vitest.config.ts) y
// `window` no existe. El bus usa `window.dispatchEvent` y `addEventListener`,
// así que necesitamos un shim. EventTarget nativo de Node cumple la misma
// API que window para los métodos que usa el bus — más liviano que jsdom.
const originalWindow = (globalThis as { window?: unknown }).window;
beforeAll(() => {
  (globalThis as { window?: EventTarget & { dispatchEvent: EventTarget["dispatchEvent"] } }).window =
    new EventTarget() as EventTarget & { dispatchEvent: EventTarget["dispatchEvent"] };
});
afterAll(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

import {
  DATA_CHANGED_EVENT,
  dispatchDataChanged,
  subscribeDataChanged,
} from "./data-events";

describe("data-events bus", () => {
  let unsubscribers: Array<() => void>;

  beforeEach(() => {
    unsubscribers = [];
  });

  afterEach(() => {
    for (const u of unsubscribers) u();
  });

  it("dispatch sin suscriptores no tira", () => {
    expect(() => dispatchDataChanged({ resource: "finder" })).not.toThrow();
  });

  it("subscribe sin filtros recibe todos los eventos", () => {
    const cb = vi.fn();
    unsubscribers.push(subscribeDataChanged({}, cb));
    dispatchDataChanged({ resource: "finder" });
    dispatchDataChanged({ resource: "empresa", resourceId: 7 });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("filtro por resource solo recibe los que matchean", () => {
    const cbFinder = vi.fn();
    const cbEmpresa = vi.fn();
    unsubscribers.push(subscribeDataChanged({ resource: "finder" }, cbFinder));
    unsubscribers.push(subscribeDataChanged({ resource: "empresa" }, cbEmpresa));

    dispatchDataChanged({ resource: "finder", resourceId: "f1" });
    dispatchDataChanged({ resource: "empresa", resourceId: 7 });
    dispatchDataChanged({ resource: "grupo", resourceId: 3 });

    expect(cbFinder).toHaveBeenCalledTimes(1);
    expect(cbFinder).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "finder", resourceId: "f1" })
    );
    expect(cbEmpresa).toHaveBeenCalledTimes(1);
    expect(cbEmpresa).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "empresa" })
    );
  });

  it("filtro por parent (entidad anidada) descarta eventos de otras empresas", () => {
    const cb = vi.fn();
    unsubscribers.push(
      subscribeDataChanged(
        { resource: "tarea", parent: { resource: "empresa", id: 100 } },
        cb
      )
    );

    // Tarea de empresa 100 → SÍ
    dispatchDataChanged({
      resource: "tarea",
      resourceId: 1,
      parent: { resource: "empresa", id: 100 },
    });
    // Tarea de empresa 999 → NO
    dispatchDataChanged({
      resource: "tarea",
      resourceId: 2,
      parent: { resource: "empresa", id: 999 },
    });
    // Tarea sin parent → NO (el filtro requiere parent)
    dispatchDataChanged({ resource: "tarea", resourceId: 3 });
    // Nota de la misma empresa → NO (resource distinto)
    dispatchDataChanged({
      resource: "nota",
      resourceId: 4,
      parent: { resource: "empresa", id: 100 },
    });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toMatchObject({ resourceId: 1 });
  });

  it("filtro por parent.resource sin id matchea cualquier id del padre", () => {
    const cb = vi.fn();
    unsubscribers.push(
      subscribeDataChanged(
        { resource: "tarea", parent: { resource: "empresa" } },
        cb
      )
    );
    dispatchDataChanged({
      resource: "tarea",
      parent: { resource: "empresa", id: 100 },
    });
    dispatchDataChanged({
      resource: "tarea",
      parent: { resource: "empresa", id: 200 },
    });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("filtro por action filtra create/update/delete", () => {
    const cb = vi.fn();
    unsubscribers.push(
      subscribeDataChanged({ resource: "finder", action: "delete" }, cb)
    );
    dispatchDataChanged({ resource: "finder", action: "create" });
    dispatchDataChanged({ resource: "finder", action: "update" });
    dispatchDataChanged({ resource: "finder", action: "delete" });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("filtro por resourceId concreto", () => {
    const cb = vi.fn();
    unsubscribers.push(
      subscribeDataChanged({ resource: "empresa", resourceId: 42 }, cb)
    );
    dispatchDataChanged({ resource: "empresa", resourceId: 41 });
    dispatchDataChanged({ resource: "empresa", resourceId: 42 });
    dispatchDataChanged({ resource: "empresa", resourceId: 43 });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toMatchObject({ resourceId: 42 });
  });

  it("unsubscribe deja de recibir eventos", () => {
    const cb = vi.fn();
    const unsub = subscribeDataChanged({ resource: "finder" }, cb);
    dispatchDataChanged({ resource: "finder" });
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
    dispatchDataChanged({ resource: "finder" });
    expect(cb).toHaveBeenCalledTimes(1); // sigue en 1
  });

  it("múltiples suscriptores al mismo resource reciben todos", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    unsubscribers.push(subscribeDataChanged({ resource: "grupo" }, cb1));
    unsubscribers.push(subscribeDataChanged({ resource: "grupo" }, cb2));
    dispatchDataChanged({ resource: "grupo", resourceId: 5 });
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it("el nombre del evento es estable", () => {
    expect(DATA_CHANGED_EVENT).toBe("wr:data-changed");
  });

  it("SSR safety: dispatchDataChanged + subscribeDataChanged no-op si window no existe", () => {
    // Simulamos SSR borrando window temporalmente.
    const originalWindow = global.window;
    // @ts-expect-error — quitamos window a propósito
    delete global.window;
    try {
      expect(() => dispatchDataChanged({ resource: "finder" })).not.toThrow();
      const unsub = subscribeDataChanged({}, () => {});
      expect(typeof unsub).toBe("function");
      expect(() => unsub()).not.toThrow();
    } finally {
      global.window = originalWindow;
    }
  });
});
