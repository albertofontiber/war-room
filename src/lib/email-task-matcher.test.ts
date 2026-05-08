/**
 * Tests del matcher SentItems → Tareas.
 *
 * Cubre: filtro de dominios @fontiber.com (interno), extracción de recipients,
 * dedup por internetMessageId, no-op si no hay match (privacy), creación
 * atómica Tarea+EmailIngest cuando matchea, manejo de race conditions.
 *
 * Mocks: prisma + auditLog. La integración con Microsoft Graph (listSentItems)
 * se cubrirá manualmente en preview tras desplegar.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recipientsOf, type SentItem } from "./email-graph";

const findUniqueMock = vi.fn();
const findManyMock = vi.fn();
const txMock = vi.fn();
const tareaCreateMock = vi.fn();
const ingestCreateMock = vi.fn();
const auditLogMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    emailIngest: {
      findUnique: (...a: unknown[]) => findUniqueMock(...a),
    },
    contacto: {
      findMany: (...a: unknown[]) => findManyMock(...a),
    },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) =>
      txMock(cb).then((r: unknown) =>
        // Si txMock no llama explícitamente al callback, lo invoca con los mocks
        // de tx para que ingestSentItem pueda usarlos.
        r === undefined ? cb({
          tarea: { create: (...a: unknown[]) => tareaCreateMock(...a) },
          emailIngest: { create: (...a: unknown[]) => ingestCreateMock(...a) },
        }) : r
      ),
  },
}));

vi.mock("@/lib/audit-log", () => ({
  auditLog: (...a: unknown[]) => auditLogMock(...a),
}));

vi.mock("@/lib/email-graph", async () => {
  const actual = await vi.importActual<typeof import("./email-graph")>(
    "./email-graph"
  );
  return { ...actual };
});

import { __testing__ } from "./email-task-matcher";

const { externalRecipients } = __testing__;

function makeItem(opts: {
  id?: string;
  internetMessageId?: string;
  subject?: string | null;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  sentDateTime?: string;
}): SentItem {
  const mkRcpts = (arr?: string[]) =>
    (arr ?? []).map((address) => ({
      emailAddress: { name: null, address },
    }));
  return {
    id: opts.id ?? "id-1",
    internetMessageId: opts.internetMessageId ?? "<msg-1@fontiber.com>",
    subject: opts.subject === undefined ? "Saludo" : opts.subject,
    sentDateTime: opts.sentDateTime ?? "2026-05-07T18:00:00.000Z",
    toRecipients: mkRcpts(opts.to),
    ccRecipients: mkRcpts(opts.cc),
    bccRecipients: mkRcpts(opts.bcc),
  };
}

describe("recipientsOf", () => {
  it("extrae To+CC+BCC en lowercase y dedup", () => {
    const item = makeItem({
      to: ["Alice@Acme.com"],
      cc: ["bob@acme.com", "ALICE@acme.com"],
      bcc: ["warroom@fontiber.com"],
    });
    const r = recipientsOf(item);
    expect(r.sort()).toEqual(
      ["alice@acme.com", "bob@acme.com", "warroom@fontiber.com"].sort()
    );
  });

  it("ignora addresses vacíos / undefined", () => {
    const item: SentItem = {
      ...makeItem({}),
      toRecipients: [
        { emailAddress: { name: null, address: "real@x.com" } },
        { emailAddress: { name: null, address: "" } },
      ],
    };
    expect(recipientsOf(item)).toEqual(["real@x.com"]);
  });
});

describe("externalRecipients", () => {
  it("filtra @fontiber.com (interno)", () => {
    const item = makeItem({
      to: ["aize@empresa.com", "alberto@fontiber.com"],
      cc: ["gabriel@fontiber.com"],
    });
    expect(externalRecipients(item).sort()).toEqual(["aize@empresa.com"]);
  });

  it("devuelve [] si todos los recipients son internos", () => {
    const item = makeItem({
      to: ["alberto@fontiber.com"],
      cc: ["gabriel@fontiber.com"],
    });
    expect(externalRecipients(item)).toEqual([]);
  });

  it("ignora addresses sin @ válido", () => {
    const item: SentItem = {
      ...makeItem({}),
      toRecipients: [
        { emailAddress: { name: null, address: "noatsign" } },
        { emailAddress: { name: null, address: "ok@x.com" } },
      ],
    };
    expect(externalRecipients(item)).toEqual(["ok@x.com"]);
  });
});

describe("ingestSentItem (vía mock de prisma)", () => {
  let ingestSentItem: typeof import("./email-task-matcher")["__testing__"]["ingestSentItem"];

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
        emailIngest: { create: (...a: unknown[]) => ingestCreateMock(...a) },
      })
    );
    // Cargar bajo demanda para que pille los mocks.
    const mod = await import("./email-task-matcher");
    ingestSentItem = mod.__testing__.ingestSentItem;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dedup: si ya existe EmailIngest con ese messageId, no crea nada", async () => {
    findUniqueMock.mockResolvedValue({ id: 999 });
    const item = makeItem({ to: ["aize@empresa.com"] });
    const r = await ingestSentItem(item, "alberto@fontiber.com");
    expect(r).toEqual({ created: false, matched: true });
    expect(findManyMock).not.toHaveBeenCalled();
    expect(tareaCreateMock).not.toHaveBeenCalled();
  });

  it("no-op: email solo a @fontiber.com (sin externos)", async () => {
    findUniqueMock.mockResolvedValue(null);
    const item = makeItem({ to: ["gabriel@fontiber.com"] });
    const r = await ingestSentItem(item, "alberto@fontiber.com");
    expect(r).toEqual({ created: false, matched: false });
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("privacy: recipient externo sin Contacto → NO se persiste", async () => {
    findUniqueMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([]); // ningún Contacto
    const item = makeItem({ to: ["abogado@externos.com"] });
    const r = await ingestSentItem(item, "alberto@fontiber.com");
    expect(r).toEqual({ created: false, matched: false });
    expect(tareaCreateMock).not.toHaveBeenCalled();
    expect(ingestCreateMock).not.toHaveBeenCalled();
  });

  it("match: crea Tarea + EmailIngest atómicamente", async () => {
    findUniqueMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([
      { id: 7, email: "aize@empresa.com", empresaId: 42, nombre: "Aize Bua" },
    ]);
    tareaCreateMock.mockResolvedValue({ id: 1234, titulo: "Saludo" });
    ingestCreateMock.mockResolvedValue({});

    const item = makeItem({
      internetMessageId: "<m1@x>",
      subject: "Saludo",
      to: ["aize@empresa.com"],
    });
    const r = await ingestSentItem(item, "alberto@fontiber.com");
    expect(r).toEqual({ created: true, matched: true });

    expect(tareaCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          empresaId: 42,
          tipo: "email",
          titulo: "Saludo",
          completada: true,
        }),
      })
    );
    expect(ingestCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          internetMessageId: "<m1@x>",
          recipientEmail: "aize@empresa.com",
          contactoId: 7,
          empresaId: 42,
          tareaId: 1234,
        }),
      })
    );
  });

  it("subject vacío → titulo '(sin asunto)'", async () => {
    findUniqueMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([
      { id: 7, email: "aize@empresa.com", empresaId: 42, nombre: "Aize" },
    ]);
    tareaCreateMock.mockResolvedValue({ id: 1, titulo: "(sin asunto)" });
    ingestCreateMock.mockResolvedValue({});

    const item = makeItem({ subject: null, to: ["aize@empresa.com"] });
    await ingestSentItem(item, "alberto@fontiber.com");
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
      new Error("Unique constraint failed on the fields: (`internetMessageId`)")
    );

    const item = makeItem({ to: ["aize@empresa.com"] });
    const r = await ingestSentItem(item, "alberto@fontiber.com");
    expect(r).toEqual({ created: false, matched: true });
  });

  it("recipient interno con [WR] match: SOLO se procesa el externo", async () => {
    findUniqueMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([
      { id: 7, email: "aize@empresa.com", empresaId: 42, nombre: "Aize" },
    ]);
    tareaCreateMock.mockResolvedValue({ id: 1 });
    ingestCreateMock.mockResolvedValue({});

    const item = makeItem({
      to: ["aize@empresa.com"],
      cc: ["gabriel@fontiber.com"], // interno: se pasa a Contacto.findMany pero no matchea
    });
    await ingestSentItem(item, "alberto@fontiber.com");

    // Contacto.findMany se llama solo con los externos.
    expect(findManyMock).toHaveBeenCalledWith({
      where: { email: { in: ["aize@empresa.com"] } },
      select: expect.any(Object),
    });
  });
});
