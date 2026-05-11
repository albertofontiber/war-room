/**
 * Tests del helper de threading de notas.
 *
 * Cubre `loadThreadRoot` (walk hacia arriba, padre borrado, root directo) y
 * `visibilityForReply` (root finder → siempre true, root admin → hereda flag).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    nota: {
      findUnique: (...a: unknown[]) => findUniqueMock(...a),
    },
  },
}));

import { loadThreadRoot, visibilityForReply } from "./notas-thread";

beforeEach(() => {
  findUniqueMock.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadThreadRoot", () => {
  it("nota sin padre → es el root", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: 1,
      empresaId: 42,
      autorId: "admin-1",
      autorFinderId: null,
      visibleAFinder: true,
      parentId: null,
    });
    const root = await loadThreadRoot(1);
    expect(root).toEqual({
      id: 1,
      empresaId: 42,
      autorId: "admin-1",
      autorFinderId: null,
      visibleAFinder: true,
    });
    expect(findUniqueMock).toHaveBeenCalledTimes(1);
  });

  it("walk hasta el root", async () => {
    // 3 niveles: 100 → 50 → 1 (root)
    findUniqueMock
      .mockResolvedValueOnce({ id: 100, empresaId: 42, autorId: "a", autorFinderId: null, visibleAFinder: false, parentId: 50 })
      .mockResolvedValueOnce({ id: 50, empresaId: 42, autorId: "b", autorFinderId: null, visibleAFinder: false, parentId: 1 })
      .mockResolvedValueOnce({ id: 1, empresaId: 42, autorId: "root-author", autorFinderId: null, visibleAFinder: true, parentId: null });

    const root = await loadThreadRoot(100);
    expect(root?.id).toBe(1);
    expect(root?.visibleAFinder).toBe(true);
    expect(root?.autorId).toBe("root-author");
  });

  it("nota inicial no existe → null", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    const root = await loadThreadRoot(999);
    expect(root).toBeNull();
  });

  it("padre intermedio borrado → usa el último válido como root", async () => {
    findUniqueMock
      .mockResolvedValueOnce({ id: 50, empresaId: 42, autorId: "b", autorFinderId: null, visibleAFinder: true, parentId: 1 })
      .mockResolvedValueOnce(null); // padre id=1 borrado mientras walk

    const root = await loadThreadRoot(50);
    // El último válido (50) actúa como root.
    expect(root?.id).toBe(50);
  });
});

describe("visibilityForReply", () => {
  it("root es de finder → respuesta siempre visibleAFinder=true", () => {
    expect(
      visibilityForReply({
        id: 1,
        empresaId: 42,
        autorId: null,
        autorFinderId: "finder-1",
        visibleAFinder: false, // irrelevante para root finder
      })
    ).toBe(true);
  });

  it("root es de admin con visibleAFinder=true → respuesta visible", () => {
    expect(
      visibilityForReply({
        id: 1,
        empresaId: 42,
        autorId: "admin-1",
        autorFinderId: null,
        visibleAFinder: true,
      })
    ).toBe(true);
  });

  it("root es de admin con visibleAFinder=false → respuesta interna", () => {
    expect(
      visibilityForReply({
        id: 1,
        empresaId: 42,
        autorId: "admin-1",
        autorFinderId: null,
        visibleAFinder: false,
      })
    ).toBe(false);
  });
});
