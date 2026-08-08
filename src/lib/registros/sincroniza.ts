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
} from "@/lib/policia/sync";

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

  // Para Cepreven, "novedad" no es una empresa nueva en la base —no crea
  // ninguna— sino una que pasa a estar calificada, que es la que interesa.
  const nuevas = [...plan.altas, ...plan.cambios]
    .filter((e) => e.cepreven === "calificada")
    .map((e) => {
      const areas: string[] = e.ceprevenAreas ? JSON.parse(e.ceprevenAreas) : [];
      return {
        nombre: e.nombre,
        cif: "",
        detalle: areas.length
          ? `calificada en ${areas.length}: ${areas.map((a) => ETIQUETA_AREA[a] ?? a).join(", ")}`
          : "calificada",
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
      nuevasCalificadas: nuevas.length,
      bajasSinAplicar: plan.bajas.length,
      degradacionesSinAplicar: plan.degradaciones.length,
    },
  };
}

/** Localiza y baja el PDF de calificadas vigente. */
async function descargaListadoCepreven(): Promise<Buffer> {
  const URL_DESCARGAS = "https://www.calificacioncepreven.com/Descarga-Documentos.html";
  const AGENTE = "war-room/1.0 (+contacto@fontiber.com)";

  const portada = await fetch(URL_DESCARGAS, { headers: { "User-Agent": AGENTE } });
  if (!portada.ok) throw new Error(`HTTP ${portada.status} al abrir la página de descargas`);

  const html = await portada.text();
  const enlace = [...html.matchAll(/href="([^"]*Listado[^"]*\.pdf)"/gi)].map((m) => m[1])[0];
  if (!enlace) throw new Error("No se encontró el enlace al listado de calificación");

  const url = new URL(enlace.replace(/ /g, "%20"), URL_DESCARGAS).toString();
  const res = await fetch(url, { headers: { "User-Agent": AGENTE } });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// ───────────────────────────────────────────────────────────────────────────

export async function sincronizaSeguridadPrivada(): Promise<ResultadoRegistro> {
  const [catalunya, euskadi] = await Promise.all([
    fetchRegistroCatalunya(),
    parseRegistroEuskadi(),
  ]);

  let nacional: EmpresaRegistro[] = [];
  let edicion: string | null = null;
  const hallado = await localizaListado(new Date());
  if (hallado) {
    edicion = hallado.fecha.toISOString().slice(0, 10);
    nacional = await parseListadoPolicia(await descargaListado(hallado.url));
  }

  log.info(
    "registros/seguridad-privada",
    `nacional ${nacional.length} · catalunya ${catalunya.length} · euskadi ${euskadi.length}`
  );

  // Que la Policía no publique nada este mes es lo normal. Que fallen los dos
  // de dirección fija, no: eso es cambio de formato.
  if (catalunya.length === 0 && euskadi.length === 0) {
    return {
      registro: "Seguridad privada",
      altas: [],
      actualizadas: 0,
      avisos: [],
      resumen: { nacional: nacional.length, catalunya: 0, euskadi: 0 },
      ilegible:
        "Ni el registro catalán ni el vasco devolvieron empresas. Lo más " +
        "probable es que hayan cambiado el formato de publicación.",
    };
  }

  const empresas: EmpresaSeguridad[] = await prisma.empresa.findMany({
    select: {
      id: true, cif: true, nombre: true, sector: true,
      habilitaciones: true, ambitoGeo: true,
    },
  });

  const plan = planificaHabilitaciones(empresas, [
    { registro: "policia", empresas: nacional },
    { registro: "catalunya", empresas: catalunya },
    { registro: "euskadi", empresas: euskadi },
  ]);

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

  const avisos = plan.sinRespaldo.length
    ? [
        `Seguridad privada — ${plan.sinRespaldo.length} ya no figuran en ningún ` +
          `registro (sin aplicar): ${plan.sinRespaldo.map((e) => e.nombre).join(", ")}`,
      ]
    : [];

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
    resumen: {
      edicionNacional: edicion,
      nacional: nacional.length,
      catalunya: catalunya.length,
      euskadi: euskadi.length,
      altas: plan.altas.length,
      actualizaciones: plan.actualizaciones.length,
      sinRespaldo: plan.sinRespaldo.length,
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
      detalle:
        `${a.instalacion.length} categorías de instalación y ` +
        `${a.mantenimiento.length} de mantenimiento · ${a.ccaa}`,
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
