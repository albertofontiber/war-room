import { describe, expect, it } from "vitest";
import { isIncompleteChatResponse } from "./chat-response-status";

describe("isIncompleteChatResponse", () => {
  it("avisa si el stream se corta aunque haya texto parcial", () => {
    expect(isIncompleteChatResponse([{ type: "text", text: "Parcial" }], undefined)).toBe(true);
  });

  it("avisa si el modelo termina sin texto o agota los pasos o tokens", () => {
    expect(isIncompleteChatResponse([{ type: "tool-execute_sql" }], "stop")).toBe(true);
    expect(isIncompleteChatResponse([{ type: "text", text: " " }], "stop")).toBe(true);
    expect(isIncompleteChatResponse([{ type: "text", text: "Parcial" }], "tool-calls")).toBe(true);
    expect(isIncompleteChatResponse([{ type: "text", text: "Parcial" }], "length")).toBe(true);
  });

  it("acepta una respuesta visible que termina normalmente", () => {
    expect(isIncompleteChatResponse([{ type: "text", text: "Respuesta" }], "stop")).toBe(false);
  });
});
