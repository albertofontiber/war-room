/**
 * Tests del matcher Calendar Events → Tareas.
 *
 * Cubre: skip cancelados nuevos, filtro de dominios @fontiber.com (interno),
 * extracción de attendees (org + asistentes, exc. declinados), dedup por
 * iCalUId, no-op si no hay match (privacy), creación atómica Tarea+
 * CalendarIngest cuando matchea, pasado vs futuro, online vs presencial,
 * race conditions; y los casos v2 de UPDATE (reagendado, subject change,
 * online toggle, cancelación tras ingestar, respeto a edición manual).
 *
 * Mocks: prisma + auditLog. La integración con Microsoft Graph
 * (listCalendarEventsSince) se cubrirá manualmente tras desplegar.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attendeeEmailsOf,
  extractEmailsFromBody,
  type CalendarEvent,
  type EventBody,
} from "./calendar-graph";

const ingestFindUniqueMock = vi.fn();
const ingestUpdateMock = vi.fn();
const tareaFindUniqueMock = vi.fn();
const tareaUpdateMock = vi.fn();
const findManyMock = vi.fn();
const txMock = vi.fn();
const tareaCreateMock = vi.fn();
const ingestCreateMock = vi.fn();
const auditLogMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    calendarIngest: {
      findUnique: (...a: unknown[]) => ingestFindUniqueMock(...a),
      update: (...a: unknown[]) => ingestUpdateMock(...a),
    },
    tarea: {
      findUnique: (...a: unknown[]) => tareaFindUniqueMock(...a),
      update: (...a: unknown[]) => tareaUpdateMock(...a),
    },
    contacto: {
      findMany: (...a: unknown[]) => findManyMock(...a),
    },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) =>
      txMock(cb).then((r: unknown) =>
        r === undefined
          ? cb({
              tarea: {
                create: (...a: unknown[]) => tareaCreateMock(...a),
                update: (...a: unknown[]) => tareaUpdateMock(...a),
              },
              calendarIngest: {
                create: (...a: unknown[]) => ingestCreateMock(...a),
                update: (...a: unknown[]) => ingestUpdateMock(...a),
              },
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

const { externalAttendees, CANCELLED_RESULT_TEXT } = __testing__;

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
  body?: EventBody | null;
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
    body: opts.body === undefined ? null : opts.body,
  };
}

/** Snapshot por defecto del CalendarIngest existente — tarea futura, presencial. */
function existingIngest(overrides: Partial<{
  id: number;
  tareaId: number | null;
  startAt: Date;
  endAt: Date;
  subject: string | null;
  isOnlineMeeting: boolean;
}> = {}) {
  return {
    id: 99,
    tareaId: 1234,
    startAt: new Date("2030-01-01T10:00:00Z"),
    endAt: new Date("2030-01-01T11:00:00Z"),
    subject: "Reunión Acme",
    isOnlineMeeting: false,
    ...overrides,
  };
}

/** Snapshot por defecto de la Tarea ligada — pendiente, sin resultado. */
function existingTarea(overrides: Partial<{
  titulo: string;
  tipo: string;
  fechaLimite: Date | null;
  completada: boolean;
  completadaAt: Date | null;
  resultado: string | null;
}> = {}) {
  return {
    titulo: "Reunión Acme",
    tipo: "reunion_presencial",
    fechaLimite: new Date("2030-01-01T10:00:00Z"),
    completada: false,
    completadaAt: null,
    resultado: null,
    ...overrides,
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

describe("extractEmailsFromBody", () => {
  it("plain text: extrae emails", () => {
    const r = extractEmailsFromBody({
      contentType: "text",
      content: "Reunion con foo@bar.com y otro: BAZ@qux.io",
    });
    expect(r.sort()).toEqual(["baz@qux.io", "foo@bar.com"].sort());
  });

  it("HTML auto-linked mailto: extrae el href", () => {
    const r = extractEmailsFromBody({
      contentType: "html",
      content: '<p>Contacto: <a href="mailto:Foo@Bar.com">Foo@Bar.com</a></p>',
    });
    expect(r).toEqual(["foo@bar.com"]);
  });

  it("HTML párrafo plano sin mailto: regex sigue pillando email", () => {
    const r = extractEmailsFromBody({
      contentType: "html",
      content: "<p>Mi email es contacto@empresa.es y nada más</p>",
    });
    expect(r).toEqual(["contacto@empresa.es"]);
  });

  it("decodifica &#64; (entidad HTML que esconde @)", () => {
    const r = extractEmailsFromBody({
      contentType: "html",
      content: "Hidden: foo&#64;bar.com",
    });
    expect(r).toEqual(["foo@bar.com"]);
  });

  it("dedup case-insensitive", () => {
    const r = extractEmailsFromBody({
      contentType: "html",
      content: '<a href="mailto:Foo@Bar.com">FOO@BAR.COM</a> y foo@bar.com',
    });
    expect(r).toEqual(["foo@bar.com"]);
  });

  it("body null o vacío → []", () => {
    expect(extractEmailsFromBody(null)).toEqual([]);
    expect(extractEmailsFromBody({ contentType: "text", content: "" })).toEqual([]);
  });

  it("body sin emails → []", () => {
    expect(
      extractEmailsFromBody({
        contentType: "text",
        content: "Reunión a las 10. Sala 3.",
      })
    ).toEqual([]);
  });

  it("ignora cadenas sin TLD (foo@bar sin .ext)", () => {
    const r = extractEmailsFromBody({
      contentType: "text",
      content: "garbage@nope and real@valid.com",
    });
    expect(r).toEqual(["real@valid.com"]);
  });
});

describe("ingestCalendarEvent — CREATE (path nuevo)", () => {
  let ingestCalendarEvent: typeof import("./calendar-task-matcher")["__testing__"]["ingestCalendarEvent"];

  beforeEach(async () => {
    ingestFindUniqueMock.mockReset();
    ingestUpdateMock.mockReset();
    tareaFindUniqueMock.mockReset();
    tareaUpdateMock.mockReset();
    findManyMock.mockReset();
    txMock.mockReset();
    tareaCreateMock.mockReset();
    ingestCreateMock.mockReset();
    auditLogMock.mockReset();
    auditLogMock.mockResolvedValue(undefined);
    txMock.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        tarea: {
          create: (...a: unknown[]) => tareaCreateMock(...a),
          update: (...a: unknown[]) => tareaUpdateMock(...a),
        },
        calendarIngest: {
          create: (...a: unknown[]) => ingestCreateMock(...a),
          update: (...a: unknown[]) => ingestUpdateMock(...a),
        },
      })
    );
    const mod = await import("./calendar-task-matcher");
    ingestCalendarEvent = mod.__testing__.ingestCalendarEvent;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skip: cancelado NO ingerido (sin existing) → ni crea ni actualiza", async () => {
    ingestFindUniqueMock.mockResolvedValue(null);
    const e = makeEvent({
      isCancelled: true,
      attendees: [{ address: "aize@empresa.com" }],
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r).toEqual({
      created: false,
      updated: false,
      matched: false,
      skipped: "cancelled",
    });
    // findUnique sí se llamó (por orden v2: dedup primero), pero findMany no.
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("skip: solo attendees @fontiber.com (interno)", async () => {
    ingestFindUniqueMock.mockResolvedValue(null);
    const e = makeEvent({
      organizer: "alberto@fontiber.com",
      attendees: [{ address: "gabriel@fontiber.com" }],
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r).toEqual({
      created: false,
      updated: false,
      matched: false,
      skipped: "internal-only",
    });
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("privacy: attendee externo sin Contacto → NO se persiste", async () => {
    ingestFindUniqueMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([]);
    const e = makeEvent({ attendees: [{ address: "abogado@externos.com" }] });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r).toEqual({
      created: false,
      updated: false,
      matched: false,
      skipped: null,
    });
    expect(tareaCreateMock).not.toHaveBeenCalled();
  });

  it("futuro: match crea Tarea pendiente (completada=false)", async () => {
    ingestFindUniqueMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([
      { id: 7, email: "aize@empresa.com", empresaId: 42, nombre: "Aize Bua" },
    ]);
    tareaCreateMock.mockResolvedValue({ id: 1234, titulo: "Reunión Acme" });
    ingestCreateMock.mockResolvedValue({});

    const e = makeEvent({
      iCalUId: "ical-future",
      subject: "Reunión Acme",
      attendees: [{ address: "aize@empresa.com" }],
      start: "2030-01-01T10:00:00.0000000",
      end: "2030-01-01T11:00:00.0000000",
      isOnlineMeeting: false,
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r).toEqual({
      created: true,
      updated: false,
      matched: true,
      skipped: null,
    });

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
    ingestFindUniqueMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([
      { id: 7, email: "aize@empresa.com", empresaId: 42, nombre: "Aize" },
    ]);
    tareaCreateMock.mockResolvedValue({ id: 1, titulo: "Past" });
    ingestCreateMock.mockResolvedValue({});

    const e = makeEvent({
      iCalUId: "ical-past",
      attendees: [{ address: "aize@empresa.com" }],
      start: "2020-01-01T10:00:00.0000000",
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
    ingestFindUniqueMock.mockResolvedValue(null);
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
    ingestFindUniqueMock.mockResolvedValue(null);
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

  it("race: unique constraint violation → no-op gracioso (ya ingerido)", async () => {
    ingestFindUniqueMock.mockResolvedValue(null);
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
    expect(r).toEqual({
      created: false,
      updated: false,
      matched: true,
      skipped: null,
    });
  });

  it("attendee declinado se excluye del matching", async () => {
    ingestFindUniqueMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([]);
    const e = makeEvent({
      iCalUId: "ical-declined",
      attendees: [{ address: "aize@empresa.com", declined: true }],
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r.matched).toBe(false);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("body-only: solo attendees internos pero email en body matchea Contacto", async () => {
    ingestFindUniqueMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([
      {
        id: 7,
        email: "silvaglez.alberto@gmail.com",
        empresaId: 42,
        nombre: "Alberto Silva",
      },
    ]);
    tareaCreateMock.mockResolvedValue({ id: 1, titulo: "[BLOCK] Test videollamada" });
    ingestCreateMock.mockResolvedValue({});

    const e = makeEvent({
      iCalUId: "ical-body-only",
      subject: "[BLOCK] Test videollamada",
      attendees: [{ address: "alberto@fontiber.com" }],
      isOnlineMeeting: true,
      body: {
        contentType: "html",
        content:
          '<p><a href="mailto:Silvaglez.alberto@gmail.com">Silvaglez.alberto@gmail.com</a></p>',
      },
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r).toEqual({
      created: true,
      updated: false,
      matched: true,
      skipped: null,
    });

    expect(findManyMock).toHaveBeenCalledWith({
      where: { email: { in: ["silvaglez.alberto@gmail.com"] } },
      select: expect.any(Object),
    });
    expect(tareaCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          empresaId: 42,
          tipo: "videollamada",
        }),
      })
    );
  });

  it("body + attendees: union de candidatos, dedup en findMany", async () => {
    ingestFindUniqueMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([
      { id: 7, email: "aize@empresa.com", empresaId: 42, nombre: "Aize" },
    ]);
    tareaCreateMock.mockResolvedValue({ id: 1 });
    ingestCreateMock.mockResolvedValue({});

    const e = makeEvent({
      iCalUId: "ical-mix",
      attendees: [{ address: "aize@empresa.com" }],
      body: { contentType: "text", content: "CC: extra@otro.com" },
    });
    await ingestCalendarEvent(e, "alberto@fontiber.com");

    const call = findManyMock.mock.calls[0][0];
    const emails = call.where.email.in as string[];
    expect(emails.sort()).toEqual(["aize@empresa.com", "extra@otro.com"].sort());
  });

  it("body con email @fontiber.com NO se incluye como candidato", async () => {
    ingestFindUniqueMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([]);
    const e = makeEvent({
      iCalUId: "ical-body-internal",
      attendees: [{ address: "alberto@fontiber.com" }],
      body: { contentType: "text", content: "Aviso: cc gabriel@fontiber.com" },
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r).toEqual({
      created: false,
      updated: false,
      matched: false,
      skipped: "internal-only",
    });
    expect(findManyMock).not.toHaveBeenCalled();
  });
});

describe("ingestCalendarEvent — UPDATE (v2)", () => {
  let ingestCalendarEvent: typeof import("./calendar-task-matcher")["__testing__"]["ingestCalendarEvent"];

  beforeEach(async () => {
    ingestFindUniqueMock.mockReset();
    ingestUpdateMock.mockReset();
    tareaFindUniqueMock.mockReset();
    tareaUpdateMock.mockReset();
    findManyMock.mockReset();
    txMock.mockReset();
    tareaCreateMock.mockReset();
    ingestCreateMock.mockReset();
    auditLogMock.mockReset();
    auditLogMock.mockResolvedValue(undefined);
    txMock.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        tarea: {
          create: (...a: unknown[]) => tareaCreateMock(...a),
          update: (...a: unknown[]) => tareaUpdateMock(...a),
        },
        calendarIngest: {
          create: (...a: unknown[]) => ingestCreateMock(...a),
          update: (...a: unknown[]) => ingestUpdateMock(...a),
        },
      })
    );
    const mod = await import("./calendar-task-matcher");
    ingestCalendarEvent = mod.__testing__.ingestCalendarEvent;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("no-op: ingest existe y nada cambió → updated:false, sin update calls", async () => {
    ingestFindUniqueMock.mockResolvedValue(existingIngest());
    tareaFindUniqueMock.mockResolvedValue(existingTarea());

    const e = makeEvent({
      iCalUId: "ical-noop",
      subject: "Reunión Acme",
      start: "2030-01-01T10:00:00.0000000",
      end: "2030-01-01T11:00:00.0000000",
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r).toEqual({
      created: false,
      updated: false,
      matched: true,
      skipped: null,
    });
    expect(tareaUpdateMock).not.toHaveBeenCalled();
    expect(ingestUpdateMock).not.toHaveBeenCalled();
  });

  it("reagendado: nueva fecha → update Tarea.fechaLimite + ingest snapshot", async () => {
    ingestFindUniqueMock.mockResolvedValue(existingIngest());
    tareaFindUniqueMock.mockResolvedValue(existingTarea());

    const e = makeEvent({
      iCalUId: "ical-reschedule",
      subject: "Reunión Acme",
      start: "2030-02-15T16:00:00.0000000",
      end: "2030-02-15T17:00:00.0000000",
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r.updated).toBe(true);

    // Tarea.update con nueva fechaLimite
    expect(tareaUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1234 },
        data: expect.objectContaining({
          fechaLimite: new Date("2030-02-15T16:00:00Z"),
        }),
      })
    );
    // CalendarIngest.update con startAt/endAt nuevos
    expect(ingestUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 99 },
        data: expect.objectContaining({
          startAt: new Date("2030-02-15T16:00:00Z"),
          endAt: new Date("2030-02-15T17:00:00Z"),
        }),
      })
    );
  });

  it("subject cambia → update titulo", async () => {
    ingestFindUniqueMock.mockResolvedValue(existingIngest());
    tareaFindUniqueMock.mockResolvedValue(existingTarea());

    const e = makeEvent({
      iCalUId: "ical-subject",
      subject: "Reunión Acme — confirmada agenda",
      start: "2030-01-01T10:00:00.0000000",
      end: "2030-01-01T11:00:00.0000000",
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r.updated).toBe(true);

    expect(tareaUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          titulo: "Reunión Acme — confirmada agenda",
        }),
      })
    );
  });

  it("isOnlineMeeting cambia false→true → update tipo a videollamada", async () => {
    ingestFindUniqueMock.mockResolvedValue(
      existingIngest({ isOnlineMeeting: false })
    );
    tareaFindUniqueMock.mockResolvedValue(
      existingTarea({ tipo: "reunion_presencial" })
    );

    const e = makeEvent({
      iCalUId: "ical-online-toggle",
      subject: "Reunión Acme",
      start: "2030-01-01T10:00:00.0000000",
      end: "2030-01-01T11:00:00.0000000",
      isOnlineMeeting: true,
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r.updated).toBe(true);

    expect(tareaUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tipo: "videollamada" }),
      })
    );
    expect(ingestUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isOnlineMeeting: true }),
      })
    );
  });

  it("cancelación tras ingestar (resultado==null) → completa con texto explicativo", async () => {
    ingestFindUniqueMock.mockResolvedValue(existingIngest());
    tareaFindUniqueMock.mockResolvedValue(
      existingTarea({ completada: false, resultado: null })
    );

    const e = makeEvent({
      iCalUId: "ical-cancelled-after",
      subject: "Reunión Acme",
      isCancelled: true,
      start: "2030-01-01T10:00:00.0000000",
      end: "2030-01-01T11:00:00.0000000",
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r.updated).toBe(true);

    expect(tareaUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          completada: true,
          completadaAt: expect.any(Date),
          resultado: CANCELLED_RESULT_TEXT,
        }),
      })
    );
  });

  it("cancelación pero usuario YA editó resultado → preserva resultado y completada", async () => {
    ingestFindUniqueMock.mockResolvedValue(existingIngest());
    tareaFindUniqueMock.mockResolvedValue(
      existingTarea({
        completada: true,
        completadaAt: new Date("2030-01-01T11:00:00Z"),
        resultado: "Cerrado deal en la reunión, pendiente firma NDA",
      })
    );

    const e = makeEvent({
      iCalUId: "ical-cancel-edited",
      subject: "Reunión Acme",
      isCancelled: true,
      start: "2030-01-01T10:00:00.0000000",
      end: "2030-01-01T11:00:00.0000000",
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    // No actualizó tarea (no diff en titulo/tipo/fecha y resultado preservado).
    expect(r.updated).toBe(false);
    expect(tareaUpdateMock).not.toHaveBeenCalled();
  });

  it("reagendar con resultado editado: actualiza titulo/fecha pero NO completada/resultado", async () => {
    ingestFindUniqueMock.mockResolvedValue(existingIngest());
    tareaFindUniqueMock.mockResolvedValue(
      existingTarea({
        completada: true,
        completadaAt: new Date("2030-01-01T11:00:00Z"),
        resultado: "La reunión fue muy productiva",
      })
    );

    const e = makeEvent({
      iCalUId: "ical-reschedule-edited",
      subject: "Reunión Acme — segunda vuelta",
      start: "2030-03-01T10:00:00.0000000",
      end: "2030-03-01T11:00:00.0000000",
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r.updated).toBe(true);

    const callData = tareaUpdateMock.mock.calls[0][0].data;
    expect(callData.titulo).toBe("Reunión Acme — segunda vuelta");
    expect(callData.fechaLimite).toEqual(new Date("2030-03-01T10:00:00Z"));
    // No tocamos completada ni resultado.
    expect("completada" in callData).toBe(false);
    expect("resultado" in callData).toBe(false);
    expect("completadaAt" in callData).toBe(false);
  });

  it("evento futuro reagendado al pasado (sin edición manual) → marca completada", async () => {
    ingestFindUniqueMock.mockResolvedValue(existingIngest());
    tareaFindUniqueMock.mockResolvedValue(
      existingTarea({ completada: false, completadaAt: null, resultado: null })
    );

    const e = makeEvent({
      iCalUId: "ical-resched-past",
      subject: "Reunión Acme",
      start: "2020-01-01T10:00:00.0000000",
      end: "2020-01-01T11:00:00.0000000",
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r.updated).toBe(true);

    const callData = tareaUpdateMock.mock.calls[0][0].data;
    expect(callData.completada).toBe(true);
    expect(callData.completadaAt).toEqual(new Date("2020-01-01T11:00:00Z"));
  });

  it("ingest huérfano (Tarea borrada manualmente) → no crashea, refresca solo snapshot", async () => {
    ingestFindUniqueMock.mockResolvedValue(existingIngest({ tareaId: null }));

    const e = makeEvent({
      iCalUId: "ical-orphan",
      subject: "Reunión Acme — fecha movida",
      start: "2030-02-01T10:00:00.0000000",
      end: "2030-02-01T11:00:00.0000000",
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r).toEqual({
      created: false,
      updated: false,
      matched: true,
      skipped: null,
    });
    // Refresca el snapshot del ingest (start/end nuevos).
    expect(ingestUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 99 },
        data: expect.objectContaining({
          startAt: new Date("2030-02-01T10:00:00Z"),
        }),
      })
    );
    // No intenta actualizar la tarea (no existe).
    expect(tareaFindUniqueMock).not.toHaveBeenCalled();
    expect(tareaUpdateMock).not.toHaveBeenCalled();
  });

  it("ingest existe pero la Tarea fue borrada → trata como huérfano", async () => {
    ingestFindUniqueMock.mockResolvedValue(existingIngest());
    tareaFindUniqueMock.mockResolvedValue(null);

    const e = makeEvent({
      iCalUId: "ical-tarea-deleted",
      subject: "Reunión Acme",
      start: "2030-01-01T10:00:00.0000000",
      end: "2030-01-01T11:00:00.0000000",
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r).toEqual({
      created: false,
      updated: false,
      matched: true,
      skipped: null,
    });
    expect(tareaUpdateMock).not.toHaveBeenCalled();
  });
});
