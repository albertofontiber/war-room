/**
 * Consolidación y plan de sincronización del RIPCI.
 *
 * Funciones puras: agrupan las filas del buscador en empresas y deciden qué
 * habría que escribir. Ni consultan ni escriben, para que las usen igual el
 * script manual y el cron.
 */

import { CATEGORIA_POR_CODIGO, CATEGORIA_SOLO_MANTENIMIENTO } from "./categorias";
import type { FilaRipci } from "./buscador";

export interface EmpresaRipci {
  nif: string;
  titular: string;
  ccaa: string;
  instalacion: string[];
  mantenimiento: string[];
  /** Fecha de inscripción más antigua vista, en ISO. */
  desde: string | null;
}

export interface EmpresaBase {
  id: number;
  cif: string | null;
  nombre: string;
  ripci: unknown;
}

export interface PlanRipci {
  /** Ya están en la base y cambian sus categorías. */
  actualizaciones: (EmpresaRipci & { id: number; nombre: string })[];
  /** No estaban. */
  altas: EmpresaRipci[];
}

/** La tercera pieza del número: sección + habilitación + categoría. */
const PIEZA = /^\w{2}-B-([DE])C(.)-/i;

/** DD/MM/AAAA -> AAAA-MM-DD, para poder comparar y guardar. */
export function aIso(fecha: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(fecha);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Agrupa las filas (una por empresa y categoría) en empresas. */
export function consolida(filas: readonly FilaRipci[]): EmpresaRipci[] {
  const porNif = new Map<string, EmpresaRipci & { inst: Set<string>; mant: Set<string> }>();

  for (const f of filas) {
    const e =
      porNif.get(f.nif) ??
      {
        nif: f.nif, titular: f.titular, ccaa: f.ccaa,
        instalacion: [], mantenimiento: [], desde: null,
        inst: new Set<string>(), mant: new Set<string>(),
      };

    const iso = aIso(f.fecha);
    if (iso && (!e.desde || iso < e.desde)) e.desde = iso;

    const p = PIEZA.exec(f.numero);
    if (p) {
      const categoria = CATEGORIA_POR_CODIGO[p[2].toUpperCase()];
      // "Extintores de incendios" solo existe como habilitación de
      // mantenimiento; si apareciera como instalación, sería un dato erróneo.
      if (categoria) {
        if (p[1].toUpperCase() === "D") {
          if (categoria !== CATEGORIA_SOLO_MANTENIMIENTO) e.inst.add(categoria);
        } else {
          e.mant.add(categoria);
        }
      }
    }

    porNif.set(f.nif, e);
  }

  return [...porNif.values()]
    .map(({ inst, mant, ...e }) => ({
      ...e,
      instalacion: [...inst].sort(),
      mantenimiento: [...mant].sort(),
    }))
    .filter((e) => e.instalacion.length || e.mantenimiento.length)
    .sort((a, b) => a.titular.localeCompare(b.titular, "es"));
}

function mismas(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
}

/**
 * @param empresas Universo de la base.
 * @param delRegistro Empresas que devuelve el buscador.
 */
export function planificaRipci(
  empresas: readonly EmpresaBase[],
  delRegistro: readonly EmpresaRipci[]
): PlanRipci {
  const porCif = new Map<string, EmpresaBase>();
  for (const e of empresas) if (e.cif) porCif.set(e.cif.toUpperCase(), e);

  const plan: PlanRipci = { actualizaciones: [], altas: [] };

  for (const r of delRegistro) {
    const enBase = porCif.get(r.nif.toUpperCase());
    if (!enBase) {
      plan.altas.push(r);
      continue;
    }

    const guardado = enBase.ripci as { instalacion?: string[]; mantenimiento?: string[] } | null;
    const igual =
      guardado &&
      mismas(guardado.instalacion ?? [], r.instalacion) &&
      mismas(guardado.mantenimiento ?? [], r.mantenimiento);
    if (igual) continue;

    plan.actualizaciones.push({ ...r, id: enBase.id, nombre: enBase.nombre });
  }

  return plan;
}
