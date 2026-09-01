/**
 * Sincronización de los tres registros del sector con la base.
 *
 * Cada función hace su trabajo y DEVUELVE lo ocurrido, sin notificar: es el
 * cron quien compone un único aviso con las novedades de los tres, en vez de
 * mandar tres correos la misma mañana.
 *
 * Los tres se refrescan a la vez porque son la misma pregunta desde tres
 * ángulos —quién está habilitado para qué— y porque ninguno se mueve más de
 * unas pocas veces al año.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import type { ResultadoRegistro } from "./tipos";

// ── Cepreven ───────────────────────────────────────────────────────────────
import { parseListadoCepreven } from "@/lib/cepreven/parse-listado";
import { descargaListadoCepreven } from "@/lib/cepreven/localiza-listado";
import { fetchAsociados } from "@/lib/cepreven/parse-asociados";
import { ETIQUETA_AREA } from "@/lib/cepreven/areas";
import {
  escriturasSeguras,
  planificaSync,
  type EmpresaEstado,
} from "@/lib/cepreven/sync";

// ── Seguridad privada ──────────────────────────────────────────────────────
import { parseListadoPolicia } from "@/lib/policia/parse-empresas";
import { parseRegistroEuskadi } from "@/lib/policia/parse-euskadi";
import { fetchRegistroCatalunya } from "@/lib/policia/fetch-catalunya";
import { ETIQUETA_HABILITACION } from "@/lib/policia/habilitaciones";
import { descargaListado, localizaListado } from "@/lib/policia/localiza-listado";
import {
  planificaHabilitaciones,
  type EmpresaBase as EmpresaSeguridad,
  type EmpresaRegistro,
  type Registro,
} from "@/lib/policia/sync";
import { motivo } from "./red";

// ── RIPCI ──────────────────────────────────────────────────────────────────
import {
  consultaDesde,
  consultaPorNif,
  formatoFecha,
  type FilaRipci,
} from "@/lib/ripci/buscador";
import {
  consolida,
  planificaRipci,
  type EmpresaBase as EmpresaRipciBase,
} from "@/lib/ripci/sync";

/** Ventana del RIPCI: cubre el mes corrido y deja margen si una pasada falla. */
const DIAS_VENTANA_RIPCI = 45;

/** Las escrituras van en tandas para no agotar la conexión. */
const TANDA = 200;

async function enTandas<T>(items: T[], hacer: (t: T) => Prisma.PrismaPromise<unknown>) {
  for (let i = 0; i < items.length; i += TANDA) {
    await prisma.$transaction(items.slice(i, i + TANDA).map(hacer));
  }
}

// ───────────────────────────────────────────────────────────────────────────

export async function sincronizaCepreven(): Promise<ResultadoRegistro> {
  const [pdf, asociadas] = await Promise.all([
    descargaListadoCepreven(),
    fetchAsociados(),
  ]);
  const listado = await parseListadoCepreven(pdf);

  log.info(
    "registros/cepreven",
    `${listado.empresas.length} calificadas y ${asociadas.length} asociadas`
  );

  if (listado.empresas.length === 0 || asociadas.length === 0) {
    return {
      registro: "Cepreven",
      altas: [],
      actualizadas: 0,
      avisos: [],
      resumen: { calificadas: listado.empresas.length, asociadas: asociadas.length },
      ilegible:
        `Cepreven devolvió ${listado.empresas.length} calificadas y ` +
        `${asociadas.length} asociadas. Probablemente hayan cambiado el formato ` +
        `del PDF o el diseño de la web.`,
    };
  }

  const empresas: EmpresaEstado[] = await prisma.empresa.findMany({
    select: { id: true, cif: true, nombre: true, cepreven: true, ceprevenAreas: true },
  });

  const plan = planificaSync(empresas, listado.empresas, asociadas);
  const escrituras = escriturasSeguras(plan);

  await enTandas(escrituras, (e) =>
    prisma.empresa.update({
      where: { id: e.id },
      data: { cepreven: e.cepreven, ceprevenAreas: e.ceprevenAreas },
    })
  );

  // Para Cepreven, "novedad" no es una empresa nueva en la base —este sync no
  // crea ninguna— sino una que estrena estado. Calificada y asociada van
  // separadas: son cosas distintas y la calificación es la que pesa, porque
  // implica haber pasado la auditoría en áreas concretas.
  const nuevas = [...plan.altas, ...plan.cambios].map((e) => {
    const calificada = e.cepreven === "calificada";
    const areas: string[] = e.ceprevenAreas ? JSON.parse(e.ceprevenAreas) : [];
    return {
      nombre: e.nombre,
      cif: "",
      grupo: calificada ? "Calificadas" : "Asociadas",
      detalle: calificada
        ? areas.length
          ? `${areas.length} áreas: ${areas.map((a) => ETIQUETA_AREA[a] ?? a).join(", ")}`
          : "sin áreas cargadas todavía"
        : "miembro de la asociación, sin calificación",
    };
  });

  const avisos: string[] = [];
  if (plan.bajas.length) {
    avisos.push(
      `Cepreven — ${plan.bajas.length} ya no figuran en los listados (sin aplicar; ` +
        `puede ser baja real o que su nombre no case): ` +
        plan.bajas.map((e) => e.nombre).join(", ")
    );
  }
  if (plan.degradaciones.length) {
    avisos.push(
      `Cepreven — ${plan.degradaciones.length} perderían la calificación (sin aplicar): ` +
        plan.degradaciones.map((e) => e.nombre).join(", ")
    );
  }

  return {
    registro: "Cepreven",
    altas: nuevas,
    actualizadas: escrituras.length,
    avisos,
    resumen: {
      calificadas: listado.empresas.length,
      asociadas: asociadas.length,
      aplicadas: escrituras.length,
      nuevasCalificadas: nuevas.filter((n) => n.grupo === "Calificadas").length,
      nuevasAsociadas: nuevas.filter((n) => n.grupo === "Asociadas").length,
      bajasSinAplicar: plan.bajas.length,
      degradacionesSinAplicar: plan.degradaciones.length,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────

/** Lectura de una fuente: o trae datos, o trae el motivo por el que no. */
type Lectura<T> = { ok: true; valor: T } | { ok: false; motivo: string };

async function intenta<T>(fn: () => Promise<T>): Promise<Lectura<T>> {
  try {
    return { ok: true, valor: await fn() };
  } catch (err) {
    return { ok: false, motivo: motivo(err) };
  }
}

/**
 * Última edición del listado nacional, si hay alguna nueva.
 *
 * Devolver null es lo normal: la Policía publica dos o tres ediciones al año,
 * así que la mayoría de los meses no hay nada nuevo que leer. Eso no es un
 * fallo y no debe tratarse como tal.
 */
async function leeListadoNacional(): Promise<{ edicion: string; empresas: EmpresaRegistro[] } | null> {
  const hallado = await localizaListado(new Date());
  if (!hallado) return null;
  return {
    edicion: hallado.fecha.toISOString().slice(0, 10),
    empresas: await parseListadoPolicia(await descargaListado(hallado.url)),
  };
}

export async function sincronizaSeguridadPrivada(): Promise<ResultadoRegistro> {
  // Los tres registros, cada uno por su cuenta. Que se caiga uno no puede
  // tirar a los otros dos: es la misma regla que aplica el cron entre los tres
  // registros del sector, y aquí dentro —donde "seguridad privada" son en
  // realidad tres fuentes— hacía falta igual.
  const [nac, cat, eus] = await Promise.all([
    intenta(leeListadoNacional),
    intenta(fetchRegistroCatalunya),
    intenta(() => parseRegistroEuskadi()),
  ]);

  const fuentes: { registro: Registro; empresas: readonly EmpresaRegistro[] }[] = [];
  const problemas: string[] = [];

  /**
   * Da una fuente por leída solo si ha devuelto empresas. Cero no es "ya no
   * queda ninguna", es un cambio de formato — y darlo por bueno marcaría como
   * desaparecidas a todas las empresas que salieron de ahí.
   */
  function anota(registro: Registro, etiqueta: string, lectura: Lectura<readonly EmpresaRegistro[]>) {
    if (!lectura.ok) {
      problemas.push(`no se pudo leer ${etiqueta}: ${lectura.motivo}`);
      return;
    }
    if (lectura.valor.length === 0) {
      problemas.push(`${etiqueta} devolvió cero empresas; probablemente haya cambiado el formato`);
      return;
    }
    fuentes.push({ registro, empresas: lectura.valor });
  }

  // El orden importa: los autonómicos son más específicos y pisan al nacional
  // cuando una empresa sale en los dos.
  let edicion: string | null = null;
  if (!nac.ok) {
    problemas.push(`no se pudo leer el listado nacional: ${nac.motivo}`);
  } else if (nac.valor) {
    edicion = nac.valor.edicion;
    anota("policia", `el listado nacional del ${edicion}`, { ok: true, valor: nac.valor.empresas });
  }
  anota("catalunya", "el registro catalán", cat);
  anota("euskadi", "el registro vasco", eus);

  log.info(
    "registros/seguridad-privada",
    fuentes.map((f) => `${f.registro} ${f.empresas.length}`).join(" · ") +
      (problemas.length ? ` · problemas: ${problemas.join("; ")}` : "")
  );

  // Sin ninguna fuente legible no hay nada que sincronizar. Se lanza para que
  // el cron lo reporte como fallo del registro, con el porqué de cada una.
  if (fuentes.length === 0) throw new Error(problemas.join("; "));

  const empresas: EmpresaSeguridad[] = await prisma.empresa.findMany({
    select: {
      id: true, cif: true, nombre: true, sector: true,
      habilitaciones: true, ambitoGeo: true, registroFuente: true,
    },
  });

  const plan = planificaHabilitaciones(empresas, fuentes);

  await enTandas(plan.actualizaciones, (a) =>
    prisma.empresa.update({
      where: { id: a.id },
      data: {
        habilitaciones: a.habilitaciones as Prisma.InputJsonValue,
        ambitoGeo: a.ambitoGeo,
        registroFuente: a.registroFuente,
      },
    })
  );
  await enTandas(plan.altas, (a) =>
    prisma.empresa.create({
      data: {
        cif: a.cif,
        nombre: a.nombre,
        sector: "seguridad_electronica",
        enPerimetro: true,
        provincia: "",
        ccaa: "",
        habilitaciones: a.habilitaciones as Prisma.InputJsonValue,
        ambitoGeo: a.ambitoGeo,
        registroFuente: a.registroFuente,
        fuente: `registro_${a.registroFuente}`,
      },
    })
  );

  const avisos: string[] = [];
  if (plan.sinRespaldo.length) {
    avisos.push(
      `Seguridad privada — ${plan.sinRespaldo.length} ya no figuran en su ` +
        `registro (sin aplicar): ${plan.sinRespaldo.map((e) => e.nombre).join(", ")}`
    );
  }
  for (const problema of problemas) avisos.push(`Seguridad privada — ${problema}`);

  return {
    registro: "Seguridad privada",
    altas: plan.altas.map((a) => ({
      nombre: a.nombre,
      cif: a.cif,
      detalle: Object.entries(a.habilitaciones)
        .map(([k, v]) => `${ETIQUETA_HABILITACION[k] ?? k} (${v === "E" ? "estatal" : "autonómico"})`)
        .join(", "),
    })),
    actualizadas: plan.actualizaciones.length,
    avisos,
    fuentesConProblema: problemas.length,
    resumen: {
      edicionNacional: edicion,
      ...Object.fromEntries(fuentes.map((f) => [f.registro, f.empresas.length])),
      altas: plan.altas.length,
      actualizaciones: plan.actualizaciones.length,
      sinRespaldo: plan.sinRespaldo.length,
      fuentesLeidas: fuentes.length,
      fuentesConProblema: problemas.length,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────

export async function sincronizaRipci(): Promise<ResultadoRegistro> {
  const desde = formatoFecha(new Date(Date.now() - DIAS_VENTANA_RIPCI * 86_400_000));

  const filas: FilaRipci[] = [];
  for (const seccion of ["D", "E"] as const) {
    filas.push(...(await consultaDesde(seccion, desde)));
  }
  log.info("registros/ripci", `${filas.length} filas desde ${desde}`);

  if (filas.length === 0) {
    return {
      registro: "RIPCI",
      altas: [],
      actualizadas: 0,
      avisos: [],
      resumen: { desde, filas: 0 },
      ilegible:
        `El buscador del RIPCI no devolvió ninguna inscripción desde ${desde}, ` +
        `cuando lo normal son decenas al mes.`,
    };
  }

  const empresas: EmpresaRipciBase[] = await prisma.empresa.findMany({
    select: { id: true, cif: true, nombre: true, ripci: true },
  });

  // La consulta por fecha solo trae las categorías inscritas DENTRO de la
  // ventana, no el estado completo. Guardar eso tal cual borraría las
  // categorías antiguas, así que de las que parecen haber cambiado se pide la
  // ficha entera por NIF. Son unas pocas al mes.
  const candidatas = planificaRipci(empresas, consolida(filas));
  const completas = [];
  for (const c of [...candidatas.altas, ...candidatas.actualizaciones]) {
    const suyas: FilaRipci[] = [];
    for (const seccion of ["D", "E"] as const) {
      suyas.push(...(await consultaPorNif(seccion, c.nif)));
    }
    const [entera] = consolida(suyas);
    if (entera) completas.push(entera);
  }

  const plan = planificaRipci(empresas, completas);

  await enTandas(plan.actualizaciones, (r) =>
    prisma.empresa.update({
      where: { id: r.id },
      data: {
        ripci: { instalacion: r.instalacion, mantenimiento: r.mantenimiento } as Prisma.InputJsonValue,
        ...(r.desde ? { ripciAlta: new Date(r.desde) } : {}),
      },
    })
  );
  await enTandas(plan.altas, (r) =>
    prisma.empresa.create({
      data: {
        cif: r.nif,
        nombre: r.titular,
        sector: "PCI",
        enPerimetro: true,
        provincia: "",
        ccaa: r.ccaa,
        ripci: { instalacion: r.instalacion, mantenimiento: r.mantenimiento } as Prisma.InputJsonValue,
        ...(r.desde ? { ripciAlta: new Date(r.desde) } : {}),
        fuente: "ripci",
      },
    })
  );

  return {
    registro: "RIPCI",
    altas: plan.altas.map((a) => ({
      nombre: a.titular,
      cif: a.nif,
      zona: a.ccaa,
      detalle:
        `${a.instalacion.length} categorías de instalación y ` +
        `${a.mantenimiento.length} de mantenimiento`,
    })),
    actualizadas: plan.actualizaciones.length,
    avisos: [],
    resumen: {
      desde,
      filas: filas.length,
      revisadas: completas.length,
      altas: plan.altas.length,
      actualizaciones: plan.actualizaciones.length,
    },
  };
}
