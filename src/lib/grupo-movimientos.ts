/**
 * Movimientos de un grupo consolidador (Attlon, Grupo Fire…) en un periodo:
 * qué empresas ha incorporado y cuándo.
 *
 * La ficha de empresa NO guarda cuándo entró en el grupo: `Empresa.grupoId`
 * lo rellena el cron del BORME la primera vez que detecta a gente del grupo
 * (o venía del Excel inicial). La fecha de entrada se reconstruye con las
 * alertas BORME que tienen `grupoInferidoId` = el grupo: la PRIMERA de cada
 * empresa marca cuándo aparece vinculada al grupo. Es la misma señal que usa
 * la vista de Operaciones. Si la empresa tuvo una adquisición o fusión poco
 * antes (VENTANA_ADQUISICION_DIAS), la entrada se adelanta a esa fecha: el
 * acto de compra a veces sale sin grupo inferido (el socio único es un
 * vehículo con otro nombre) y los nombramientos del grupo llegan días después.
 *
 * La parte pura (`clasificarMovimientos`) está separada de la consulta para
 * poder testearla sin BD.
 */

import { extractAdquirente } from "@/lib/borme-adquirente";

export type AlertaGrupo = {
  id: number;
  empresaId: number;
  empresaNombre: string;
  /** Empresa.grupoId actual de la empresa de la alerta. */
  empresaGrupoId: number | null;
  fecha: Date;
  tipoActo: string;
  descripcion: string | null;
  grupoInferidoId: number | null;
};

export type MiembroGrupo = { id: number; nombre: string };

/** Actos con peso propio para M&A. `nombramiento`/`otros` son ruido salvo
 *  como primera señal de vínculo con el grupo. */
export const ACTOS_RELEVANTES = [
  "adquisicion",
  "posible_adquisicion",
  "fusion",
  "nombramiento_grupo",
  "cambio_denominacion",
  "disolucion",
];

const MAX_DESC = 220;
export const VENTANA_ADQUISICION_DIAS = 90;
const DIA_MS = 24 * 60 * 60 * 1000;

export type ActoResumen = {
  fecha: string; // YYYY-MM-DD
  tipoActo: string;
  resumen: string;
};

export type EntradaGrupo = {
  empresaId: number;
  empresa: string;
  /** Primera alerta BORME que vincula la empresa al grupo, o la adquisición/
   *  fusión que la precede en menos de VENTANA_ADQUISICION_DIAS. */
  fechaEntrada: string;
  /** false = el BORME la vincula al grupo pero la ficha no la tiene asignada
   *  (posible falso positivo de la inferencia, revisar). */
  enGrupoActualmente: boolean;
  /** Socio único / sociedad absorbente extraído del texto, si aparece. */
  adquirente: string | null;
  actos: ActoResumen[];
};

export type MovimientosGrupo = {
  entradas: EntradaGrupo[];
  /** Empresas vinculadas al grupo antes del periodo (con su primera fecha). */
  anteriores: { empresaId: number; empresa: string; fechaEntrada: string; enGrupoActualmente: boolean }[];
  /** Miembros actuales sin ninguna alerta BORME del grupo: fecha de entrada
   *  desconocida (vienen del Excel inicial o de una asignación manual). */
  miembrosSinSenal: MiembroGrupo[];
  /** Otros actos relevantes en el periodo de empresas que ya eran del grupo. */
  otrosActos: (ActoResumen & { empresaId: number; empresa: string })[];
};

function dia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function resumir(desc: string | null): string {
  if (!desc) return "";
  const limpio = desc.replace(/\s+/g, " ").trim();
  return limpio.length > MAX_DESC ? `${limpio.slice(0, MAX_DESC)}…` : limpio;
}

function enRango(fecha: Date, desde: Date | null, hasta: Date): boolean {
  return (!desde || fecha >= desde) && fecha <= hasta;
}

export function clasificarMovimientos(args: {
  grupoId: number;
  alertas: AlertaGrupo[];
  miembros: MiembroGrupo[];
  desde: Date | null;
  hasta: Date;
}): MovimientosGrupo {
  const { grupoId, alertas, miembros, desde, hasta } = args;

  // Alertas por empresa, en orden cronológico.
  const porEmpresa = new Map<number, AlertaGrupo[]>();
  for (const a of [...alertas].sort((x, y) => x.fecha.getTime() - y.fecha.getTime())) {
    const lista = porEmpresa.get(a.empresaId) ?? [];
    lista.push(a);
    porEmpresa.set(a.empresaId, lista);
  }

  const entradas: EntradaGrupo[] = [];
  const anteriores: MovimientosGrupo["anteriores"] = [];
  const otrosActos: MovimientosGrupo["otrosActos"] = [];
  const conSenal = new Set<number>();

  for (const [empresaId, lista] of porEmpresa) {
    const primera = lista.find((a) => a.grupoInferidoId === grupoId);
    const nombre = lista[0].empresaNombre;
    const enGrupoActualmente = lista[0].empresaGrupoId === grupoId;
    const actosPeriodo = lista.filter(
      (a) => enRango(a.fecha, desde, hasta) && ACTOS_RELEVANTES.includes(a.tipoActo)
    );

    if (!primera) {
      // Miembro del grupo con actos en el periodo pero sin señal de grupo
      // (p. ej. un cambio de denominación): va a otrosActos.
      for (const a of actosPeriodo) {
        otrosActos.push({ empresaId, empresa: nombre, fecha: dia(a.fecha), tipoActo: a.tipoActo, resumen: resumir(a.descripcion) });
      }
      continue;
    }
    conSenal.add(empresaId);

    const compraPrevia = lista.find(
      (a) =>
        (a.tipoActo === "adquisicion" || a.tipoActo === "fusion") &&
        a.fecha <= primera.fecha &&
        primera.fecha.getTime() - a.fecha.getTime() <= VENTANA_ADQUISICION_DIAS * DIA_MS
    );
    const entrada = compraPrevia ?? primera;

    if (entrada.fecha > hasta) continue; // vinculada después del periodo

    if (enRango(entrada.fecha, desde, hasta)) {
      const actos = lista.filter(
        (a) =>
          enRango(a.fecha, desde, hasta) &&
          (ACTOS_RELEVANTES.includes(a.tipoActo) || a.id === primera.id || a.id === entrada.id)
      );
      const conAdquirente = actos.find((a) => a.tipoActo === "adquisicion" || a.tipoActo === "fusion");
      entradas.push({
        empresaId,
        empresa: nombre,
        fechaEntrada: dia(entrada.fecha),
        enGrupoActualmente,
        adquirente: conAdquirente ? extractAdquirente(conAdquirente.descripcion) : null,
        actos: actos.map((a) => ({ fecha: dia(a.fecha), tipoActo: a.tipoActo, resumen: resumir(a.descripcion) })),
      });
    } else {
      anteriores.push({ empresaId, empresa: nombre, fechaEntrada: dia(entrada.fecha), enGrupoActualmente });
      for (const a of actosPeriodo) {
        otrosActos.push({ empresaId, empresa: nombre, fecha: dia(a.fecha), tipoActo: a.tipoActo, resumen: resumir(a.descripcion) });
      }
    }
  }

  entradas.sort((a, b) => a.fechaEntrada.localeCompare(b.fechaEntrada));
  anteriores.sort((a, b) => a.fechaEntrada.localeCompare(b.fechaEntrada));
  otrosActos.sort((a, b) => a.fecha.localeCompare(b.fecha));

  return {
    entradas,
    anteriores,
    miembrosSinSenal: miembros.filter((m) => !conSenal.has(m.id)),
    otrosActos,
  };
}
