/**
 * Plan de sincronización del estado Cepreven.
 *
 * Función pura: recibe lo que dicen las dos fuentes y lo que hay en la base,
 * y devuelve qué habría que escribir. Ni consulta ni escribe. La usan el
 * script manual (`scripts/import-cepreven.ts`) y el cron semanal, para que
 * los dos se comporten igual.
 *
 * Dos salvaguardas, aprendidas de la primera simulación (ver `match.ts`):
 * las BAJAS y las DEGRADACIONES se separan del resto y no se aplican salvo
 * que se pidan expresamente. Una empresa desaparece del cruce tanto si ha
 * salido del listado como si su nombre en la base no casa con el de la
 * fuente, y lo segundo es frecuente; borrar el estado por eso sería una
 * pérdida silenciosa.
 */

import { cruza, type EmpresaBase } from "./match";
import type { EmpresaCalificada } from "./parse-listado";
import type { EmpresaAsociada } from "./parse-asociados";

export interface EmpresaEstado extends EmpresaBase {
  cepreven: string | null;
  ceprevenAreas: string | null;
}

export interface Escritura {
  id: number;
  nombre: string;
  cepreven: string | null;
  ceprevenAreas: string | null;
}

export interface PlanSync {
  /** Empresas que no tenían estado Cepreven y pasan a tenerlo. */
  altas: Escritura[];
  /** Cambian de estado o de áreas. */
  cambios: Escritura[];
  /** Ya no figuran en ningún listado. NO se aplican por defecto. */
  bajas: Escritura[];
  /** Pasarían de calificada a asociada: casi siempre es un fallo de cruce. */
  degradaciones: { id: number; nombre: string }[];
  /** Entradas de los listados que no corresponden a ninguna empresa. */
  sinCasar: { calificadas: string[]; asociadas: string[] };
}

/** Escrituras que es seguro aplicar sin revisión humana. */
export function escriturasSeguras(plan: PlanSync): Escritura[] {
  return [...plan.altas, ...plan.cambios];
}

export function planificaSync(
  empresas: readonly EmpresaEstado[],
  calificadas: readonly EmpresaCalificada[],
  asociadas: readonly EmpresaAsociada[]
): PlanSync {
  const base: EmpresaBase[] = empresas.map((e) => ({
    id: e.id,
    cif: e.cif,
    nombre: e.nombre,
  }));

  const califCruce = cruza(calificadas, base, (e) => e.nombre);
  const asocCruce = cruza(
    asociadas.filter((a) => !a.institucional),
    base,
    (e) => e.nombre
  );

  // Una empresa puede figurar dos veces con grafías distintas (el listado
  // trae "AIR FEU, S.L." y "AIRFEU, S.L."): se acumulan sus áreas.
  const areasPorEmpresa = new Map<number, Set<string>>();
  for (const { origen, empresa } of califCruce.casados) {
    const set = areasPorEmpresa.get(empresa.id) ?? new Set<string>();
    for (const a of origen.areas) set.add(a);
    areasPorEmpresa.set(empresa.id, set);
  }

  const objetivo = new Map<number, { cepreven: string; areas: string[] | null }>();
  for (const { empresa } of asocCruce.casados) {
    objetivo.set(empresa.id, { cepreven: "asociada", areas: null });
  }
  // Después, para que "calificada" —rango superior— pise a "asociada".
  for (const [id, areas] of areasPorEmpresa) {
    objetivo.set(id, { cepreven: "calificada", areas: [...areas].sort() });
  }

  const plan: PlanSync = {
    altas: [],
    cambios: [],
    bajas: [],
    degradaciones: [],
    sinCasar: {
      calificadas: califCruce.sinCasar.map((e) => e.nombre),
      asociadas: asocCruce.sinCasar.map((e) => e.nombre),
    },
  };

  for (const emp of empresas) {
    const quiere = objetivo.get(emp.id);
    const areasNuevas = quiere?.areas ? JSON.stringify(quiere.areas) : null;

    if (!quiere) {
      if (emp.cepreven) {
        plan.bajas.push({
          id: emp.id,
          nombre: emp.nombre,
          cepreven: null,
          ceprevenAreas: null,
        });
      }
      continue;
    }

    if (emp.cepreven === quiere.cepreven && (emp.ceprevenAreas ?? null) === areasNuevas) {
      continue;
    }

    if (emp.cepreven === "calificada" && quiere.cepreven === "asociada") {
      plan.degradaciones.push({ id: emp.id, nombre: emp.nombre });
      continue;
    }

    const escritura: Escritura = {
      id: emp.id,
      nombre: emp.nombre,
      cepreven: quiere.cepreven,
      ceprevenAreas: areasNuevas,
    };
    if (emp.cepreven) plan.cambios.push(escritura);
    else plan.altas.push(escritura);
  }

  return plan;
}
