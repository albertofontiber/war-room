/**
 * Tests de las utilidades puras de email-graph: `trimQuotedThread` y
 * `bodyToPlainText`. Las funciones que pegan a Microsoft Graph
 * (listSentItemsSince, getMessageBody, …) se validan manualmente tras desplegar.
 */

import { describe, expect, it } from "vitest";
import { trimQuotedThread, bodyToPlainText } from "./email-graph";

describe("trimQuotedThread", () => {
  it("recorta la cabecera de email citado de Outlook (From:/Sent:/…)", () => {
    const text = [
      "Hola Néstor,",
      "",
      "Gracias por los documentos. Lo revisamos.",
      "",
      "Gracias!",
      "Alberto",
      "",
      "From: Nestor Callejo <nestor@eldur.eu>",
      "Sent: Wednesday, May 20, 2026 11:54 AM",
      "To: Gabriel de Muguerza <gabriel@fontiber.com>",
      "Subject: RE: Eldur <> Fontiber",
      "",
      "Buenos días; adjunto el documento.",
    ].join("\n");
    expect(trimQuotedThread(text)).toBe(
      "Hola Néstor,\n\nGracias por los documentos. Lo revisamos.\n\nGracias!\nAlberto"
    );
  });

  it("recorta la cabecera de Outlook en español (De:/Enviado:/Asunto:)", () => {
    const text = [
      "Te confirmo la reunión.",
      "",
      "De: Erik <erik@extinorte.com>",
      "Enviado: lunes, 5 de mayo de 2026 9:00",
      "Para: Alberto",
      "Asunto: RE: SUA",
      "",
      "Mensaje anterior…",
    ].join("\n");
    expect(trimQuotedThread(text)).toBe("Te confirmo la reunión.");
  });

  it("recorta en el separador -----Original Message-----", () => {
    const text =
      "Mi respuesta.\n\n-----Original Message-----\nFrom: x\nbla bla";
    expect(trimQuotedThread(text)).toBe("Mi respuesta.");
  });

  it("recorta el estilo Gmail 'On … wrote:'", () => {
    const text =
      "Sounds good.\n\nOn Wed, May 20, 2026 at 11:54 AM Nestor <n@eldur.eu> wrote:\n> previous";
    expect(trimQuotedThread(text)).toBe("Sounds good.");
  });

  it("recorta el estilo Gmail español 'El … escribió:'", () => {
    const text =
      "Perfecto.\n\nEl mié, 20 may 2026 a las 11:54, Nestor (<n@eldur.eu>) escribió:\n> anterior";
    expect(trimQuotedThread(text)).toBe("Perfecto.");
  });

  it("sin hilo citado → devuelve el texto íntegro", () => {
    const text = "Email nuevo, sin respuestas.\n\nSaludos,\nAlberto";
    expect(trimQuotedThread(text)).toBe(text);
  });

  it("no recorta un 'From:' que es texto normal (sin campos de cabecera detrás)", () => {
    const text =
      "From: our experience this works well.\nWe are happy with it.\n\nSaludos";
    expect(trimQuotedThread(text)).toBe(text);
  });

  it("'… escribió:' sin fecha NO se confunde con cita de Gmail", () => {
    const text = "El responsable escribió:\n\nseguimos adelante con el plan.";
    expect(trimQuotedThread(text)).toBe(text);
  });

  it("forward sin texto propio (cita al inicio) → no recorta a vacío", () => {
    const text =
      "From: x <x@y.com>\nSent: hoy\nSubject: FW\n\ncontenido reenviado";
    expect(trimQuotedThread(text)).toBe(text.trim());
  });

  it("limpia el separador de subrayados antes del bloque citado", () => {
    const text =
      "Respuesta corta.\n\n________________________________\nFrom: x <x@y.com>\nSent: hoy\nSubject: re\n\nviejo";
    expect(trimQuotedThread(text)).toBe("Respuesta corta.");
  });
});

describe("bodyToPlainText", () => {
  it("body null o vacío → null", () => {
    expect(bodyToPlainText(null)).toBeNull();
    expect(bodyToPlainText({ contentType: "text", content: "" })).toBeNull();
  });

  it("texto plano: recorta el hilo citado", () => {
    const r = bodyToPlainText({
      contentType: "text",
      content:
        "Mi mensaje.\n\nFrom: x <x@y.com>\nSent: hoy\nSubject: re\n\nviejo",
    });
    expect(r).toBe("Mi mensaje.");
  });

  it("html: lo convierte a texto plano", () => {
    const r = bodyToPlainText({
      contentType: "html",
      content: "<p>Hola Néstor</p>",
    });
    expect(r).toBe("Hola Néstor");
  });
});
