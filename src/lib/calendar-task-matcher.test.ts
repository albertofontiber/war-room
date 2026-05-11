/**
 * Tests del matcher Calendar Events → Tareas.
 *
 * Cubre: skip cancelados, filtro de dominios @fontiber.com (interno),
 * extracción de attendees (org + asistentes, exc. declinados), dedup por
 * iCalUId, no-op si no hay match (privacy), creación atómica Tarea+
 * CalendarIngest cuando matchea, pasado vs futuro, online vs presencial,
 * race conditions.
 *
 * Mocks: prisma + auditLog. La integración con Microsoft Graph
 * (listCalendarEventsSince) se cubrirá manualmente tras desplegar.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attendeeEmailsOf, type CalendarEvent } from "./calendar-graph";

const findUniqueMock = vi.fn();
const findManyMock = vi.fn();
const txMock = vi.fn();
const tareaCreateMock = vi.fn();
const ingestCreateMock = vi.fn();
const auditLogMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    calendarIngest: {
      findUnique: (...a: unknown[]) => findUniqueMock(...a),
    },
    contacto: {
      findMany: (...a: unknown[]) => findManyMock(...a),
    },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) =>
      txMock(cb).then((r: unknown) =>
        r === undefined
          ? cb({
              tarea: { create: (...a: unknown[]) => tareaCreateMock(...a) },
              calendarIngest: { create: (...a: unknown[]) => ingestCreateMock(...a) },
            })
          : r
      ),
  },
}));

vi.mock("@/lib/audit-log", () => ({
  auditLog: (...a: unknown[]) => auditLogMock(...a),
}));

vi.mock("@/lib/calendar-graph", async () => {
  const actual = await vi.importActual<typeof import("./calendar-graph")>(
    "./calendar-graph"
  );
  return { ...actual };
});

import { __testing__ } from "./calendar-task-matcher";

const { externalAttendees } = __testing__;

function makeEvent(opts: {
  id?: string;
  iCalUId?: string;
  subject?: string | null;
  attendees?: { address: string; declined?: boolean }[];
  organizer?: string;
  start?: string;
  end?: string;
  isCancelled?: boolean;
  isOnlineMeeting?: boolean;
  lastModifiedDateTime?: string;
}): CalendarEvent {
  return {
    id: opts.id ?? "evt-1",
    iCalUId: opts.iCalUId ?? "ical-1",
    subject: opts.subject === undefined ? "Reunión Acme" : opts.subject,
    isCancelled: opts.isCancelled ?? false,
    isOnlineMeeting: opts.isOnlineMeeting ?? false,
    start: {
      dateTime: opts.start ?? "2030-01-01T10:00:00.0000000",
      timeZone: "UTC",
    },
    end: {
      dateTime: opts.end ?? "2030-01-01T11:00:00.0000000",
      timeZone: "UTC",
    },
    lastModifiedDateTime: opts.lastModifiedDateTime ?? "2026-05-09T18:00:00Z",
    organizer: opts.organizer
      ? { emailAddress: { name: null, address: opts.organizer } }
      : null,
    attendees: (opts.attendees ?? []).map((a) => ({
      type: "required" as const,
      status: { response: a.declined ? ("declined" as const) : ("accepted" as const) },
      emailAddress: { name: null, address: a.address },
    })),
  };
}

describe("attendeeEmailsOf", () => {
  it("incluye organizer + attendees no-declinados, lowercase, dedup", () => {
    const e = makeEvent({
      organizer: "Alberto@Fontiber.com",
      attendees: [
        { address: "alice@Acme.com" },
        { address: "ALBERTO@fontiber.com" }, // dedup vs organizer
        { address: "BOB@acme.com" },
      ],
    });
    expect(attendeeEmailsOf(e).sort()).toEqual(
      ["alberto@fontiber.com", "alice@acme.com", "bob@acme.com"].sort()
    );
  });

  it("excluye attendees declinados", () => {
    const e = makeEvent({
      attendees: [
        { address: "alice@acme.com" },
        { address: "bob@acme.com", declined: true },
      ],
    });
    expect(attendeeEmailsOf(e)).toEqual(["alice@acme.com"]);
  });

  it("ignora addresses vacíos", () => {
    const e = makeEvent({});
    e.attendees = [
      {
        type: "required",
        status: { response: "accepted" },
        emailAddress: { name: null, address: "" },
      },
      {
        type: "required",
        status: { response: "accepted" },
        emailAddress: { name: null, address: "ok@x.com" },
      },
    ];
    expect(attendeeEmailsOf(e)).toEqual(["ok@x.com"]);
  });
});

describe("externalAttendees", () => {
  it("filtra @fontiber.com (interno)", () => {
    const e = makeEvent({
      organizer: "alberto@fontiber.com",
      attendees: [
        { address: "aize@empresa.com" },
        { address: "gabriel@fontiber.com" },
      ],
    });
    expect(externalAttendees(e).sort()).toEqual(["aize@empresa.com"]);
  });

  it("devuelve [] si todos los attendees son internos", () => {
    const e = makeEvent({
      organizer: "alberto@fontiber.com",
      attendees: [{ address: "gabriel@fontiber.com" }],
    });
    expect(externalAttendees(e)).toEqual([]);
  });
});

describe("ingestCalendarEvent (vía mock de prisma)", () => {
  let ingestCalendarEvent: typeof import("./calendar-task-matcher")["__testing__"]["ingestCalendarEvent"];

  beforeEach(async () => {
    findUniqueMock.mockReset();
    findManyMock.mockReset();
    txMock.mockReset();
    tareaCreateMock.mockReset();
    ingestCreateMock.mockReset();
    auditLogMock.mockReset();
    auditLogMock.mockResolvedValue(undefined);
    txMock.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        tarea: { create: (...a: unknown[]) => tareaCreateMock(...a) },
        calendarIngest: { create: (...a: unknown[]) => ingestCreateMock(...a) },
      })
    );
    const mod = await import("./calendar-task-matcher");
    ingestCalendarEvent = mod.__testing__.ingestCalendarEvent;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skip: evento cancelado no llega a tocar prisma", async () => {
    const e = makeEvent({
      isCancelled: true,
      attendees: [{ address: "aize@empresa.com" }],
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r).toEqual({ created: false, matched: false, skipped: "cancelled" });
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("dedup: si ya existe CalendarIngest con ese iCalUId, no crea nada", async () => {
    findUniqueMock.mockResolvedValue({ id: 999 });
    const e = makeEvent({ attendees: [{ address: "aize@empresa.com" }] });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r).toEqual({ created: false, matched: true, skipped: null });
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("skip: solo attendees @fontiber.com (interno)", async () => {
    findUniqueMock.mockResolvedValue(null);
    const e = makeEvent({
      organizer: "alberto@fontiber.com",
      attendees: [{ address: "gabriel@fontiber.com" }],
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r).toEqual({
      created: false,
      matched: false,
      skipped: "internal-only",
    });
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("privacy: attendee externo sin Contacto → NO se persiste", async () => {
    findUniqueMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([]);
    const e = makeEvent({ attendees: [{ address: "abogado@externos.com" }] });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r).toEqual({ created: false, matched: false, skipped: null });
    expect(tareaCreateMock).not.toHaveBeenCalled();
  });

  it("futuro: match crea Tarea pendiente (completada=false)", async () => {
    findUniqueMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([
      { id: 7, email: "aize@empresa.com", empresaId: 42, nombre: "Aize Bua" },
    ]);
    tareaCreateMock.mockResolvedValue({ id: 1234, titulo: "Reunión Acme" });
    ingestCreateMock.mockResolvedValue({});

    const e = makeEvent({
      iCalUId: "ical-future",
      subject: "Reunión Acme",
      attendees: [{ address: "aize@empresa.com" }],
      start: "2030-01-01T10:00:00.0000000", // futuro
      end: "2030-01-01T11:00:00.0000000",
      isOnlineMeeting: false,
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r).toEqual({ created: true, matched: true, skipped: null });

    expect(tareaCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          empresaId: 42,
          tipo: "reunion_presencial",
          titulo: "Reunión Acme",
          completada: false,
          completadaAt: null,
        }),
      })
    );
  });

  it("pasado: match crea Tarea histórica (completada=true)", async () => {
    findUniqueMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([
      { id: 7, email: "aize@empresa.com", empresaId: 42, nombre: "Aize" },
    ]);
    tareaCreateMock.mockResolvedValue({ id: 1, titulo: "Past" });
    ingestCreateMock.mockResolvedValue({});

    const e = makeEvent({
      iCalUId: "ical-past",
      attendees: [{ address: "aize@empresa.com" }],
      start: "2020-01-01T10:00:00.0000000", // pasado
      end: "2020-01-01T11:00:00.0000000",
    });
    await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(tareaCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          completada: true,
          completadaAt: expect.any(Date),
        }),
      })
    );
  });

  it("online meeting → tipo videollamada", async () => {
    findUniqueMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([
      { id: 7, email: "aize@empresa.com", empresaId: 42, nombre: "Aize" },
    ]);
    tareaCreateMock.mockResolvedValue({ id: 1 });
    ingestCreateMock.mockResolvedValue({});

    const e = makeEvent({
      iCalUId: "ical-teams",
      attendees: [{ address: "aize@empresa.com" }],
      isOnlineMeeting: true,
    });
    await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(tareaCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tipo: "videollamada" }),
      })
    );
  });

  it("subject vacío → titulo '(sin asunto)'", async () => {
    findUniqueMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([
      { id: 7, email: "aize@empresa.com", empresaId: 42, nombre: "Aize" },
    ]);
    tareaCreateMock.mockResolvedValue({ id: 1 });
    ingestCreateMock.mockResolvedValue({});

    const e = makeEvent({
      iCalUId: "ical-empty",
      subject: null,
      attendees: [{ address: "aize@empresa.com" }],
    });
    await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(tareaCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ titulo: "(sin asunto)" }),
      })
    );
  });

  it("race: unique constraint violation → no-op gracioso", async () => {
    findUniqueMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([
      { id: 7, email: "aize@empresa.com", empresaId: 42, nombre: "Aize" },
    ]);
    tareaCreateMock.mockResolvedValue({ id: 1 });
    ingestCreateMock.mockRejectedValue(
      new Error("Unique constraint failed on the fields: (`iCalUId`)")
    );

    const e = makeEvent({
      iCalUId: "ical-race",
      attendees: [{ address: "aize@empresa.com" }],
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r).toEqual({ created: false, matched: true, skipped: null });
  });

  it("attendee declinado se excluye del matching", async () => {
    findUniqueMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([]); // sin match
    const e = makeEvent({
      iCalUId: "ical-declined",
      attendees: [{ address: "aize@empresa.com", declined: true }],
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r.matched).toBe(false);
    // findMany debería llamarse con un array vacío de externos
    expect(findManyMock).not.toHaveBeenCalled();
  });
});
