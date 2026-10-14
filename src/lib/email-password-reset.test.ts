import { describe, expect, it } from "vitest";
import {
  caducidadTexto,
  invitationEmail,
  passwordResetEmail,
} from "./email-password-reset";

const NOW = Date.UTC(2026, 9, 14, 10, 0, 0);

describe("caducidadTexto", () => {
  it("cuenta en días a partir de 2 días y en horas por debajo", () => {
    expect(caducidadTexto(new Date(NOW + 7 * 24 * 3_600_000), NOW)).toBe("7 días");
    expect(caducidadTexto(new Date(NOW + 24 * 3_600_000), NOW)).toBe("24 horas");
    expect(caducidadTexto(new Date(NOW + 3_600_000), NOW)).toBe("1 hora");
  });
});

describe("invitationEmail", () => {
  const email = invitationEmail({
    name: "Lucía <b>",
    invitedBy: "Alberto",
    url: "https://warroom.fontiber.com/reset-password?token=abc&x=1",
    expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000),
  });

  it("lleva la marca del war room, botón y enlace en claro", () => {
    expect(email.subject).toBe("Tu acceso al War Room — Fontiber War Room");
    expect(email.html).toContain("Fontiber War Room");
    expect(email.html).toContain("Elegir mi contraseña");
    expect(email.html).toContain("reset-password?token=abc&amp;x=1");
    expect(email.html).toContain("7 días");
  });

  it("escapa los nombres en el HTML y los deja tal cual en el texto plano", () => {
    expect(email.html).toContain("Lucía &lt;b&gt;");
    expect(email.html).not.toContain("Lucía <b>");
    expect(email.text).toContain("Hola Lucía <b>");
    expect(email.text).toContain("token=abc&x=1");
  });
});

describe("passwordResetEmail", () => {
  it("usa la marca de cada zona", () => {
    const expiresAt = new Date(Date.now() + 24 * 3_600_000);
    const war = passwordResetEmail({ zona: "warroom", name: "A", url: "https://x", expiresAt });
    const portal = passwordResetEmail({ zona: "portal", name: "A", url: "https://x", expiresAt });
    expect(war.subject).toContain("Fontiber War Room");
    expect(portal.subject).toContain("Fontiber Portal Finders");
    expect(portal.html).toContain("Restablecer contraseña");
  });
});
