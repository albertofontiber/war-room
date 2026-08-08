/**
 * Composición del aviso mensual de los registros del sector.
 *
 * Función pura: recibe lo que ha devuelto cada registro y arma el título y el
 * cuerpo del único mensaje que se envía —notificación en la app y correo—.
 * Separada del cron para poder probarla sin red ni base de datos.
 */

import type { EmpresaNueva, ResultadoRegistro } from "./tipos";

export interface Aviso {
  titulo: string;
  mensaje: string;
}

type AltaConOrigen = EmpresaNueva & { registro: string };

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

  // Se agrupa por registro y, dentro, por subgrupo: en Cepreven no es lo
  // mismo una empresa que se ha calificado —ha pasado la auditoría— que una
  // que solo se ha asociado, y mezclarlas en la misma lista lo ocultaría.
  const porBloque = new Map<string, AltaConOrigen[]>();
  for (const a of altas) {
    const clave = a.grupo ? `${a.registro} · ${a.grupo}` : a.registro;
    porBloque.set(clave, [...(porBloque.get(clave) ?? []), a]);
  }
  for (const [bloque, suyas] of porBloque) {
    partes.push(
      `✅ ${bloque} — ${suyas.length} ${suyas.length === 1 ? "empresa" : "empresas"}:\n` +
        suyas.map((a) => `· ${a.nombre}${a.cif ? ` (${a.cif})` : ""} — ${a.detalle}`).join("\n")
    );
  }

  for (const r of ilegibles) {
    partes.push(`⚠️ ${r.registro}: ${r.ilegible} No se ha modificado ninguna empresa.`);
  }
  for (const aviso of avisos) partes.push(`⚠️ ${aviso}`);
  for (const fallo of fallos) partes.push(`❌ Falló la sincronización de ${fallo}`);

  const actualizadas = resultados.reduce((n, r) => n + r.actualizadas, 0);
  if (actualizadas) partes.push(`(${actualizadas} fichas actualizadas sin más cambios)`);

  return {
    titulo: altas.length
      ? `🏭 ${altas.length} ${altas.length === 1 ? "empresa nueva" : "empresas nuevas"} en los registros del sector`
      : "⚠️ Registros del sector: hay algo que revisar",
    mensaje: partes.join("\n\n"),
  };
}
