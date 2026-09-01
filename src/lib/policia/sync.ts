/**
 * Plan de sincronización de las habilitaciones de seguridad privada.
 *
 * Función pura, como la de Cepreven: recibe lo que dicen los tres registros y
 * lo que hay en la base, y devuelve qué habría que escribir. Ni consulta ni
 * escribe, para que la usen igual el script manual y el cron.
 *
 * Reglas, fijadas por Alberto:
 *
 *   - El cruce es SIEMPRE por CIF. Estos registros lo publican, así que no
 *     hace falta casar por nombre y no hay riesgo de falsos positivos.
 *   - Una empresa del listado que no tenga habilitación de INSTALACIÓN no
 *     entra en el War Room, salvo que ya esté como empresa de PCI. El universo
 *     son instaladoras y mantenedoras, no vigilancia ni transporte de fondos.
 *   - El registro nacional distingue ámbito estatal (E) y autonómico (A). Los
 *     de Cataluña y Euskadi son autonómicos por definición, así que todo lo
 *     suyo es "A".
 */

import type { MapaHabilitaciones } from "./habilitaciones";

/** Los tres registros que publican habilitaciones de seguridad privada. */
export const REGISTROS = ["policia", "catalunya", "euskadi"] as const;

export type Registro = (typeof REGISTROS)[number];

/** Una empresa tal como la publica cualquiera de los tres registros. */
export interface EmpresaRegistro {
  nombre: string;
  cif: string;
  habilitaciones: MapaHabilitaciones;
}

export interface EmpresaBase {
  id: number;
  cif: string | null;
  nombre: string;
  sector: string | null;
  habilitaciones: unknown;
  ambitoGeo: string | null;
  /** De qué registro salieron sus habilitaciones, si consta. */
  registroFuente?: string | null;
}

export interface Actualizacion {
  id: number;
  nombre: string;
  habilitaciones: MapaHabilitaciones;
  /** Se mantiene en sintonía con la habilitación de instalación. */
  ambitoGeo: string | null;
  registroFuente: Registro;
  /** Para poder explicar el cambio en la simulación. */
  antes: MapaHabilitaciones;
}

export interface Alta {
  nombre: string;
  cif: string;
  habilitaciones: MapaHabilitaciones;
  ambitoGeo: string | null;
  registroFuente: Registro;
}

export interface PlanHabilitaciones {
  /** Empresas de la base cuyas habilitaciones cambian. */
  actualizaciones: Actualizacion[];
  /** Instaladoras del registro que no estaban en la base. */
  altas: Alta[];
  /** Del registro, sin instalación y sin ficha: quedan fuera por la regla. */
  descartadasSinInstalacion: number;
  /** En la base con habilitaciones, pero ya no figuran en ningún registro. */
  sinRespaldo: { id: number; nombre: string }[];
}

function mismo(a: MapaHabilitaciones, b: MapaHabilitaciones): boolean {
  const clavesA = Object.keys(a).sort();
  const clavesB = Object.keys(b).sort();
  if (clavesA.length !== clavesB.length) return false;
  return clavesA.every((k, i) => k === clavesB[i] && a[k] === b[k]);
}

function leeGuardadas(valor: unknown): MapaHabilitaciones {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
  const out: MapaHabilitaciones = {};
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    if (v === "E" || v === "A") out[k] = v;
  }
  return out;
}

/**
 * Funde las habilitaciones de una empresa que figura en más de un registro.
 *
 * Ante la misma habilitación en dos registros, gana el ámbito ESTATAL: es el
 * más amplio, y una empresa que puede operar en toda España no deja de poder
 * hacerlo porque además esté inscrita en un registro autonómico.
 *
 * Hoy da igual —de las 31 empresas que aparecen en el registro nacional y en
 * uno autonómico, ninguna tiene habilitación estatal—, pero conviene que la
 * regla sea correcta por construcción y no por cómo vengan los datos.
 */
function funde(a: MapaHabilitaciones, b: MapaHabilitaciones): MapaHabilitaciones {
  const out: MapaHabilitaciones = { ...a };
  for (const [codigo, ambito] of Object.entries(b)) {
    if (!ambito) continue;
    out[codigo] = out[codigo] === "E" || ambito === "E" ? "E" : "A";
  }
  return out;
}

/**
 * @param empresas Universo de la base.
 * @param registros Empresas publicadas por cada registro. Si una empresa sale
 *   en varios se funden sus habilitaciones; la fuente que se anota es la del
 *   último registro que la menciona.
 *
 *   Se pasan SOLO los registros que se han podido leer en esta pasada. No es
 *   lo mismo "el registro dice que esta empresa ya no está" que "no hemos
 *   podido leer el registro": lo primero es una baja y lo segundo no es nada,
 *   y de ahí depende `sinRespaldo`.
 */
export function planificaHabilitaciones(
  empresas: readonly EmpresaBase[],
  registros: readonly { registro: Registro; empresas: readonly EmpresaRegistro[] }[]
): PlanHabilitaciones {
  const porCif = new Map<string, EmpresaBase>();
  for (const e of empresas) if (e.cif) porCif.set(e.cif.toUpperCase(), e);

  // Una empresa puede figurar en el registro nacional y en uno autonómico: se
  // funden sus habilitaciones en vez de que una tanda pise a la otra.
  const consolidado = new Map<string, { fila: EmpresaRegistro; registro: Registro }>();
  for (const { registro, empresas: filas } of registros) {
    for (const fila of filas) {
      const cif = fila.cif.toUpperCase();
      const previo = consolidado.get(cif);
      consolidado.set(cif, {
        fila: previo
          ? { ...fila, habilitaciones: funde(previo.fila.habilitaciones, fila.habilitaciones) }
          : fila,
        registro,
      });
    }
  }

  const plan: PlanHabilitaciones = {
    actualizaciones: [],
    altas: [],
    descartadasSinInstalacion: 0,
    sinRespaldo: [],
  };

  for (const [cif, { fila, registro }] of consolidado) {
    const enBase = porCif.get(cif);
    const instala = Boolean(fila.habilitaciones.INS);
    const ambito = fila.habilitaciones.INS ?? null;

    if (!enBase) {
      // Regla de Alberto: sin instalación, fuera. La excepción de PCI solo
      // aplica a empresas que YA están en la base, no a altas nuevas.
      if (!instala) {
        plan.descartadasSinInstalacion++;
        continue;
      }
      plan.altas.push({
        nombre: fila.nombre,
        cif,
        habilitaciones: fila.habilitaciones,
        ambitoGeo: ambito,
        registroFuente: registro,
      });
      continue;
    }

    const antes = leeGuardadas(enBase.habilitaciones);
    if (mismo(antes, fila.habilitaciones) && enBase.ambitoGeo === ambito) continue;

    plan.actualizaciones.push({
      id: enBase.id,
      nombre: enBase.nombre,
      habilitaciones: fila.habilitaciones,
      ambitoGeo: ambito,
      registroFuente: registro,
      antes,
    });
  }

  // Empresas con habilitaciones guardadas que ya no aparecen en ningún
  // registro. No se tocan: igual que con Cepreven, se reportan para mirarlas.
  //
  // Solo se juzga a las empresas cuyo registro de origen se ha leído. Sin este
  // filtro, un mes sin edición nueva del listado nacional —lo normal, salen
  // dos o tres al año— daría por desaparecidas a las mil y pico empresas que
  // vienen de ahí. De las que no consta origen solo se puede opinar cuando se
  // han leído los tres registros.
  const leidos = new Set(registros.map((r) => r.registro));
  const todos = REGISTROS.every((r) => leidos.has(r));

  for (const e of empresas) {
    if (!e.cif || consolidado.has(e.cif.toUpperCase())) continue;
    if (Object.keys(leeGuardadas(e.habilitaciones)).length === 0) continue;
    const juzgable = e.registroFuente ? leidos.has(e.registroFuente as Registro) : todos;
    if (!juzgable) continue;
    plan.sinRespaldo.push({ id: e.id, nombre: e.nombre });
  }

  return plan;
}
