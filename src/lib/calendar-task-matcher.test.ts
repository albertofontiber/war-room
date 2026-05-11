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
import {
  attendeeEmailsOf,
  extractEmailsFromBody,
  type CalendarEvent,
  type EventBody,
} from "./calendar-graph";

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

  it("body-only: solo attendees internos pero email en body matchea Contacto", async () => {
    // Caso real: Alberto hace [BLOCK] con un asistente interno y mete el
    // email del contacto en el cuerpo del invite.
    findUniqueMock.mockResolvedValue(null);
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
      attendees: [{ address: "alberto@fontiber.com" }], // solo interno
      isOnlineMeeting: true,
      body: {
        contentType: "html",
        content:
          '<p><a href="mailto:Silvaglez.alberto@gmail.com">Silvaglez.alberto@gmail.com</a></p>',
      },
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    expect(r).toEqual({ created: true, matched: true, skipped: null });

    // Contacto.findMany se llamó con el email extraído del body
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
    findUniqueMock.mockResolvedValue(null);
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

    // findMany debe llamarse con los dos emails externos
    const call = findManyMock.mock.calls[0][0];
    const emails = call.where.email.in as string[];
    expect(emails.sort()).toEqual(["aize@empresa.com", "extra@otro.com"].sort());
  });

  it("body con email @fontiber.com NO se incluye como candidato", async () => {
    findUniqueMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([]); // simulamos no-match
    const e = makeEvent({
      iCalUId: "ical-body-internal",
      attendees: [{ address: "alberto@fontiber.com" }],
      body: { contentType: "text", content: "Aviso: cc gabriel@fontiber.com" },
    });
    const r = await ingestCalendarEvent(e, "alberto@fontiber.com");
    // Ningún externo ni en attendees ni en body → skipped internal-only,
    // findMany NO se llama (no hay candidatos).
    expect(r).toEqual({
      created: false,
      matched: false,
      skipped: "internal-only",
    });
    expect(findManyMock).not.toHaveBeenCalled();
  });
});
