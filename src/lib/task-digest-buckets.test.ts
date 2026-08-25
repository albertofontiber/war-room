/**
 * Tests del reparto de tareas del digest diario.
 *
 * El caso que motivó el módulo: una tarea creada por un admin sin asignar a
 * nadie no salía en ningún email (el WHERE del digest exigía `asignadoId`),
 * así que vencía en silencio. Ahora la hereda su autor.
 */

import { describe, expect, it } from "vitest";
import {
  agruparTareasPorUsuario,
  responsableDeTarea,
  type DigestAdmin,
  type TareaPendiente,
} from "./task-digest-buckets";

const ALBERTO: DigestAdmin = { id: "u-alberto", email: "alberto@fontiber.com", name: "Alberto" };
const GABRIEL: DigestAdmin = { id: "u-gabriel", email: "gabriel@fontiber.com", name: "Gabriel" };

const albertoRef = { ...ALBERTO, active: true };
const gabrielRef = { ...GABRIEL, active: true };

const HOY0 = new Date("2026-08-25T00:00:00");

function tarea(over: Partial<TareaPendiente> = {}): TareaPendiente {
  return {
    id: 1,
    titulo: "Escribir a Marc Viñolas",
    descripcion: null,
    tipo: "mensaje_whatsapp",
    fechaLimite: new Date("2026-08-28T09:00:00"),
    empresa: { id: 1533, nombre: "SEGURIFOC, SL" },
    asignado: null,
    asignadoFinderId: null,
    autor: albertoRef,
    ...over,
  };
}

describe("responsableDeTarea", () => {
  it("manda el asignado cuando lo hay", () => {
    expect(responsableDeTarea(tarea({ asignado: gabrielRef }))?.id).toBe("u-gabriel");
  });

  it("cae en el autor cuando no hay asignado", () => {
    expect(responsableDeTarea(tarea())?.id).toBe("u-alberto");
  });

  it("devuelve null si está asignada a un finder — esa va por el portal", () => {
    expect(responsableDeTarea(tarea({ asignadoFinderId: "f-1" }))).toBeNull();
  });

  it("prioriza el asignado sobre el autor", () => {
    expect(responsableDeTarea(tarea({ asignado: gabrielRef, autor: albertoRef }))?.id).toBe("u-gabriel");
  });

  it("devuelve null si no hay ni asignado ni autor (tareas de los crones)", () => {
    expect(responsableDeTarea(tarea({ autor: null }))).toBeNull();
  });
});

describe("agruparTareasPorUsuario", () => {
  it("incluye a todos los admins activos aunque no tengan tareas", () => {
    const m = agruparTareasPorUsuario([ALBERTO, GABRIEL], [], HOY0);
    expect(Array.from(m.keys()).sort()).toEqual(["u-alberto", "u-gabriel"]);
    expect(m.get("u-gabriel")!.bucket).toEqual({
      vencidas: [], hoy: [], proximos7: [], sinFecha: [],
    });
  });

  it("cuelga del autor la tarea sin asignar y la marca sinAsignar", () => {
    const m = agruparTareasPorUsuario([ALBERTO, GABRIEL], [tarea()], HOY0);
    const alberto = m.get("u-alberto")!;
    expect(alberto.bucket.proximos7).toHaveLength(1);
    expect(alberto.bucket.proximos7[0].sinAsignar).toBe(true);
    expect(m.get("u-gabriel")!.bucket.proximos7).toHaveLength(0);
  });

  it("no marca sinAsignar la que sí tiene asignado", () => {
    const m = agruparTareasPorUsuario([ALBERTO], [tarea({ asignado: albertoRef })], HOY0);
    expect(m.get("u-alberto")!.bucket.proximos7[0].sinAsignar).toBe(false);
  });

  it("deja fuera del digest de admins la asignada a un finder", () => {
    const m = agruparTareasPorUsuario([ALBERTO], [tarea({ asignadoFinderId: "f-1" })], HOY0);
    expect(m.get("u-alberto")!.bucket.proximos7).toHaveLength(0);
  });

  it("reparte por ventana temporal", () => {
    const m = agruparTareasPorUsuario(
      [ALBERTO],
      [
        tarea({ id: 1, fechaLimite: new Date("2026-08-24T09:00:00") }), // ayer
        tarea({ id: 2, fechaLimite: new Date("2026-08-25T09:00:00") }), // hoy
        tarea({ id: 3, fechaLimite: new Date("2026-08-28T09:00:00") }), // +3d
        tarea({ id: 4, fechaLimite: null }),                            // sin fecha
        tarea({ id: 5, fechaLimite: new Date("2026-11-12T09:00:00") }), // lejana
      ],
      HOY0
    );
    const b = m.get("u-alberto")!.bucket;
    expect(b.vencidas.map((t) => t.id)).toEqual([1]);
    expect(b.hoy.map((t) => t.id)).toEqual([2]);
    expect(b.proximos7.map((t) => t.id)).toEqual([3]);
    expect(b.sinFecha.map((t) => t.id)).toEqual([4]);
    // La #5 (nov) no entra en ningún bloque: ya asomará cuando se acerque.
  });

  it("mete en 'hoy' la que vence a las 23:59 de hoy y no en 'vencidas'", () => {
    const m = agruparTareasPorUsuario(
      [ALBERTO],
      [tarea({ fechaLimite: new Date("2026-08-25T23:59:59") })],
      HOY0
    );
    const b = m.get("u-alberto")!.bucket;
    expect(b.hoy).toHaveLength(1);
    expect(b.vencidas).toHaveLength(0);
  });

  it("ignora al responsable inactivo", () => {
    const m = agruparTareasPorUsuario(
      [ALBERTO],
      [tarea({ autor: { ...albertoRef, id: "u-baja", email: "baja@fontiber.com", active: false } })],
      HOY0
    );
    expect(m.has("u-baja")).toBe(false);
  });

  it("crea entrada al vuelo para un asignado que no está en la lista de admins", () => {
    const m = agruparTareasPorUsuario([ALBERTO], [tarea({ asignado: gabrielRef })], HOY0);
    expect(m.get("u-gabriel")!.bucket.proximos7).toHaveLength(1);
  });
});
