import { afterEach, expect, it, vi } from "vitest";
import { getChatDb } from "./chat-db";

afterEach(() => vi.unstubAllEnvs());

it("no utiliza la conexión principal si falta la URL de solo lectura", () => {
  vi.stubEnv("CHAT_READONLY_DATABASE_URL", "");
  expect(() => getChatDb()).toThrow(/solo lectura/);
});
