import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findAdminCredentialByEmail,
  getAdminCredentialConfigs,
} from "./admin-credentials";

describe("admin credential config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prioriza el email explícito y normaliza mayúsculas y espacios", () => {
    vi.stubEnv("ADMIN_EMAIL_1", "  Alberto@Fontiber.com ");
    vi.stubEnv("ADMIN_USER_1", "alias-legacy");

    expect(getAdminCredentialConfigs()[0].email).toBe(
      "alberto@fontiber.com"
    );
    expect(findAdminCredentialByEmail(" ALBERTO@FONTIBER.COM ")).toBeDefined();
  });

  it("mantiene compatibilidad con ADMIN_USER_n sin exponer el alias en login", () => {
    vi.stubEnv("ADMIN_EMAIL_2", "");
    vi.stubEnv("ADMIN_USER_2", "gabriel");

    expect(getAdminCredentialConfigs()[1].email).toBe(
      "gabriel@fontiber.com"
    );
    expect(findAdminCredentialByEmail("gabriel")).toBeUndefined();
  });

  it("acepta un email completo en la variable legacy sin duplicar dominio", () => {
    vi.stubEnv("ADMIN_EMAIL_1", "");
    vi.stubEnv("ADMIN_USER_1", "alberto@fontiber.com");

    expect(getAdminCredentialConfigs()[0].email).toBe(
      "alberto@fontiber.com"
    );
  });
});
