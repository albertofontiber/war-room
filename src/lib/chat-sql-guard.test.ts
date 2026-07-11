/**
 * Tests del guard SQL del chat IA — es código de seguridad y hasta ahora no
 * tenía cobertura. Documenta también las limitaciones conocidas del filtro
 * (por las que existe el rol read-only como segunda capa).
 */

import { describe, expect, it } from "vitest";
import { addLimit, validateSQL } from "./chat-sql-guard";

describe("validateSQL", () => {
  it("acepta SELECT simples", () => {
    expect(validateSQL('SELECT id, nombre FROM "Empresa"')).toBe(true);
    expect(validateSQL("  select count(*) from \"Tarea\"  ")).toBe(true);
    expect(validateSQL('SELECT 1;')).toBe(true); // punto y coma final tolerado
  });

  it("rechaza queries que no empiezan por SELECT", () => {
    expect(validateSQL('INSERT INTO "Nota" VALUES (1)')).toBe(false);
    expect(validateSQL('UPDATE "Empresa" SET nombre = \'x\'')).toBe(false);
    expect(validateSQL('DELETE FROM "Tarea"')).toBe(false);
    expect(validateSQL('WITH x AS (SELECT 1) SELECT * FROM x')).toBe(false); // CTE: falso negativo asumido
    expect(validateSQL("")).toBe(false);
  });

  it("rechaza keywords de escritura/DDL aunque vayan tras un SELECT", () => {
    expect(validateSQL('SELECT 1; DROP TABLE "Empresa"')).toBe(false);
    expect(validateSQL('SELECT 1; TRUNCATE "Tarea"')).toBe(false);
    expect(validateSQL("SELECT * FROM x; GRANT ALL ON y TO z")).toBe(false);
  });

  it("keyword forbidden como SUBCADENA de un identificador NO bloquea (word boundary)", () => {
    // "createdAt" contiene "create" pero \b evita el falso positivo.
    expect(validateSQL('SELECT "createdAt" FROM "Tarea"')).toBe(true);
    expect(validateSQL('SELECT * FROM "Tarea" ORDER BY "updatedAt"')).toBe(true);
  });

  it("case-insensitive en ambas direcciones", () => {
    expect(validateSQL('sElEcT * FROM "Empresa"')).toBe(true);
    expect(validateSQL("SELECT 1; dRoP TABLE x")).toBe(false);
  });

  it("no se deja engañar por espacios/; alrededor", () => {
    expect(validateSQL(";;DELETE FROM x")).toBe(false);
    expect(validateSQL("   ;SELECT 1")).toBe(false); // ';' inicial: no empieza por SELECT
  });
});

describe("addLimit", () => {
  it("añade LIMIT 100 si no hay LIMIT", () => {
    expect(addLimit('SELECT * FROM "Empresa"')).toBe('SELECT * FROM "Empresa" LIMIT 100');
  });

  it("respeta un LIMIT existente", () => {
    expect(addLimit('SELECT * FROM "Empresa" LIMIT 5')).toBe('SELECT * FROM "Empresa" LIMIT 5');
    expect(addLimit("SELECT * FROM x limit 20")).toBe("SELECT * FROM x limit 20");
  });

  it("quita el punto y coma final antes de añadir LIMIT", () => {
    expect(addLimit("SELECT 1;;")).toBe("SELECT 1 LIMIT 100");
  });
});
