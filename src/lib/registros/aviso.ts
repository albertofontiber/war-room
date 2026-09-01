/**
 * Composición del aviso mensual de los registros del sector.
 *
 * Función pura: recibe lo que ha devuelto cada registro y arma el título y el
 * cuerpo del único mensaje que se envía —notificación en la app y correo—.
 * Separada del cron para poder probarla sin red ni base de datos.
 *
 * Sale en dos formatos, con el mismo contenido:
 *
 *   - `mensaje`, texto plano, para la campanita de la app.
 *   - `html`, una tabla por bloque, para el correo. Un mes normal trae una
 *     docena de altas con tres o cuatro datos cada una, y en un párrafo
 *     corrido eso no hay quien lo lea: Outlook ignora `white-space:pre-wrap`,
 *     así que los saltos de línea del texto plano se pierden y todo llega
 *     pegado. Una tabla se lee igual en todos los clientes.
 */

import type { EmpresaNueva, ResultadoRegistro } from "./tipos";

export interface Aviso {
  titulo: string;
  /** Texto plano, para la campanita. */
  mensaje: string;
  /** El mismo contenido en tablas, para el correo. */
  html: string;
}

type AltaConOrigen = EmpresaNueva & { registro: string };

function escapa(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ESTILO = {
  titulo: "margin:22px 0 8px;font-size:14px;font-weight:600;color:#111827",
  tabla: "width:100%;border-collapse:collapse;font-size:13px;line-height:1.4",
  th:
    "text-align:left;padding:7px 10px;background:#f3f4f6;border-bottom:1px solid #e5e7eb;" +
    "font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:#6b7280;font-weight:700",
  td: "padding:8px 10px;border-bottom:1px solid #f1f2f4;color:#4b5563;vertical-align:top",
  nombre:
    "padding:8px 10px;border-bottom:1px solid #f1f2f4;color:#111827;font-weight:600;vertical-align:top",
  cif:
    "padding:8px 10px;border-bottom:1px solid #f1f2f4;color:#6b7280;vertical-align:top;" +
    "white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px",
  nota: "margin:20px 0 0;font-size:12px;color:#9ca3af",
};

/** Un bloque de altas como tabla. Las columnas vacías no se pintan. */
function tabla(altas: readonly AltaConOrigen[]): string {
  const conCif = altas.some((a) => a.cif);
  const conZona = altas.some((a) => a.zona);

  const cabeceras = [
    "Empresa",
    ...(conCif ? ["CIF"] : []),
    ...(conZona ? ["Zona"] : []),
    "Qué aporta",
  ];

  const filas = altas.map((a) => {
    const celdas = [
      `<td style="${ESTILO.nombre}">${escapa(a.nombre)}</td>`,
      ...(conCif ? [`<td style="${ESTILO.cif}">${escapa(a.cif || "—")}</td>`] : []),
      ...(conZona ? [`<td style="${ESTILO.td}">${escapa(a.zona || "—")}</td>`] : []),
      `<td style="${ESTILO.td}">${escapa(a.detalle || "—")}</td>`,
    ];
    return `<tr>${celdas.join("")}</tr>`;
  });

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${ESTILO.tabla}">` +
    `<tr>${cabeceras.map((c) => `<th style="${ESTILO.th}">${c}</th>`).join("")}</tr>` +
    filas.join("") +
    `</table>`
  );
}

/** Recuadro para lo que hay que mirar a mano y para los fallos. */
function recuadro(items: readonly string[], tono: "aviso" | "fallo"): string {
  if (!items.length) return "";
  const c =
    tono === "fallo"
      ? { fondo: "#fef2f2", borde: "#fecaca", texto: "#991b1b", icono: "❌", titulo: "No se pudo sincronizar" }
      : { fondo: "#fffbeb", borde: "#fde68a", texto: "#92400e", icono: "⚠️", titulo: "Para revisar a mano" };

  return (
    `<div style="margin:22px 0 0;padding:12px 14px;background:${c.fondo};` +
    `border:1px solid ${c.borde};border-radius:6px">` +
    `<div style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;` +
    `color:${c.texto};margin:0 0 8px">${c.icono} ${c.titulo}</div>` +
    items
      .map(
        (t) =>
          `<div style="font-size:13px;line-height:1.5;color:${c.texto};margin:0 0 6px">${escapa(t)}</div>`
      )
      .join("") +
    `</div>`
  );
}

/** Devuelve null si no hay nada que contar: sin novedades no se molesta. */
export function componeAviso(
  resultados: readonly ResultadoRegistro[],
  fallos: readonly string[] = []
): Aviso | null {
  const altas: AltaConOrigen[] = resultados.flatMap((r) =>
    r.altas.map((a) => ({ ...a, registro: r.registro }))
  );
  const avisos = resultados.flatMap((r) => r.avisos);
  const ilegibles = resultados.filter((r) => r.ilegible);

  if (!altas.length && !avisos.length && !ilegibles.length && !fallos.length) return null;

  const partes: string[] = [];
  const bloquesHtml: string[] = [];

  // Se agrupa por registro y, dentro, por subgrupo: en Cepreven no es lo
  // mismo una empresa que se ha calificado —ha pasado la auditoría— que una
  // que solo se ha asociado, y mezclarlas en la misma lista lo ocultaría.
  const porBloque = new Map<string, AltaConOrigen[]>();
  for (const a of altas) {
    const clave = a.grupo ? `${a.registro} · ${a.grupo}` : a.registro;
    porBloque.set(clave, [...(porBloque.get(clave) ?? []), a]);
  }
  for (const [bloque, suyas] of porBloque) {
    const encabezado = `${bloque} — ${suyas.length} ${suyas.length === 1 ? "empresa" : "empresas"}`;
    partes.push(
      `✅ ${encabezado}:\n` +
        suyas
          .map(
            (a) =>
              `· ${a.nombre}${a.cif ? ` (${a.cif})` : ""} — ${a.detalle}` +
              (a.zona ? ` · ${a.zona}` : "")
          )
          .join("\n")
    );
    bloquesHtml.push(`<div style="${ESTILO.titulo}">${escapa(encabezado)}</div>${tabla(suyas)}`);
  }

  const paraRevisar: string[] = [];
  for (const r of ilegibles) {
    const t = `${r.registro}: ${r.ilegible} No se ha modificado ninguna empresa.`;
    partes.push(`⚠️ ${t}`);
    paraRevisar.push(t);
  }
  for (const aviso of avisos) {
    partes.push(`⚠️ ${aviso}`);
    paraRevisar.push(aviso);
  }

  const noSincronizados = fallos.map((f) => `Falló la sincronización de ${f}`);
  for (const fallo of noSincronizados) partes.push(`❌ ${fallo}`);

  bloquesHtml.push(recuadro(paraRevisar, "aviso"));
  bloquesHtml.push(recuadro(noSincronizados, "fallo"));

  const actualizadas = resultados.reduce((n, r) => n + r.actualizadas, 0);
  if (actualizadas) {
    const pie = `(${actualizadas} fichas actualizadas sin más cambios)`;
    partes.push(pie);
    bloquesHtml.push(`<p style="${ESTILO.nota}">${escapa(pie)}</p>`);
  }

  return {
    titulo: altas.length
      ? `🏭 ${altas.length} ${altas.length === 1 ? "empresa nueva" : "empresas nuevas"} en los registros del sector`
      : "⚠️ Registros del sector: hay algo que revisar",
    mensaje: partes.join("\n\n"),
    html: bloquesHtml.filter(Boolean).join("\n"),
  };
}
