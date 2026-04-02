/**
 * GET /api/borme/personas-compartidas
 *
 * Detecta personas que aparecen en cargos de 2+ empresas distintas
 * extrayendo nombres de los textos de BormeAlerta, excluyendo las
 * personas ya conocidas en GRUPOS_SENALES.
 */

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { GRUPOS_SENALES, norm } from "@/lib/borme-senales";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

// Personas ya conocidas — se excluyen del análisis
const KNOWN_PERSONS_NORM = new Set(
  GRUPOS_SENALES.flatMap((g) => g.personas).map((p) => norm(p))
);

// Palabras que NO pueden formar parte de un nombre de persona
// (son términos estructurales del BORME o preposiciones)
const REJECT_WORDS = new Set([
  "A", "Y", "O", "E",                              // conjunciones / preposición
  "SOLIDARIOS", "SOLIDARIO", "SOLIDARIAS", "SOLIDARIA",
  "MANCOMUNADOS", "MANCOMUNADO", "MANCOMUNADAS", "MANCOMUNADA",
  "ADMINISTRADORES", "ADMINISTRADOR", "APODERADOS", "APODERADO",
  "CONSEJEROS", "CONSEJERO", "LIQUIDADORES", "LIQUIDADOR",
  "UNICO", "UNICOS", "UNICA", "UNICAS",
  "UNIPERSONAL", "UNIPERSONALIDAD",
  "SUSTITUTO", "SUSTITUTOS",
  "DELEGADO", "DELEGADOS",
  "DATOS", "REGISTRALES", "REGISTRAL",
  "TOMO", "FOLIO", "HOJA", "SECCION", "INSCRIPCION",
  // Fragmentos de palabras BORME que aparecen truncadas al inicio de un campo
  "INISTRACION", "INISTRADOR", "CONCURSAL", "SOCIEDAD", "CONSTITUCION",
]);

/** Devuelve true si el candidato tiene forma de nombre de persona */
function isLikelyPersonName(name: string): boolean {
  const words = name.split(/\s+/);
  // Debe tener entre 2 y 5 palabras
  if (words.length < 2 || words.length > 5) return false;
  // Sin palabras de 1 carácter (A, Y, O…)
  if (words.some((w) => w.length === 1)) return false;
  // Sin keywords estructurales del BORME
  if (words.some((w) => REJECT_WORDS.has(w))) return false;
  // Todas las palabras deben ser solo letras mayúsculas (sin dígitos)
  if (words.some((w) => /\d/.test(w))) return false;
  return true;
}

interface EmpresaFinanciero {
  ingresos: number | null;
  ebitda: number | null;
  ebitdaPct: number | null;
  margenBruto: number | null;
  margenBrutoPct: number | null;
  anioFinanciero: number | null;
}

interface PersonaEnEmpresa extends EmpresaFinanciero {
  empresaId: number;
  empresaNombre: string;
  grupoNombre: string | null;
  grupoId: number | null;
  rol: string | null;
  ultimaFecha: string;
  enPerimetro: boolean;
  ccaa: string | null;
  provincia: string | null;
  sector: string | null;
  web: string | null;
}

interface PersonaCompartida {
  nombreNorm: string;
  numEmpresas: number;
  ultimaAparicion: string;
  empresas: PersonaEnEmpresa[];
}

/**
 * Extrae pares (nombre_normalizado, rol) de un texto de BormeAlerta.
 * Solo extrae personas de secciones de NOMBRAMIENTO — ignora las de
 * REVOCACION, CESE o DIMISION para evitar falsos positivos.
 */
function extractPersonasFromDesc(
  desc: string
): Array<{ nombreNorm: string; rol: string | null }> {
  if (!desc) return [];

  const t = desc
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

  // Mapear posiciones de marcadores de sección positivos / negativos
  const POSITIVE_RE = /\b(NOMBRAMIENTO[S]?)\b/g;
  const NEGATIVE_RE = /\b(REVOCACION[ES]*|CESE[S]?|DIMISION[ES]*|BAJA)\b/g;

  const markers: Array<{ pos: number; positive: boolean }> = [];
  let mx: RegExpExecArray | null;
  while ((mx = POSITIVE_RE.exec(t)) !== null) markers.push({ pos: mx.index, positive: true });
  NEGATIVE_RE.lastIndex = 0;
  while ((mx = NEGATIVE_RE.exec(t)) !== null) markers.push({ pos: mx.index, positive: false });
  markers.sort((a, b) => a.pos - b.pos);

  /** Devuelve true si la posición está en un bloque de nombramiento (no revocación) */
  function isPositiveContext(pos: number): boolean {
    if (markers.length === 0) return true; // sin marcadores → incluir todo
    let last: typeof markers[0] | null = null;
    for (const marker of markers) {
      if (marker.pos < pos) last = marker;
      else break;
    }
    return last === null ? true : last.positive;
  }

  const result: Array<{ nombreNorm: string; rol: string | null }> = [];

  // Patrón: rol_abreviado seguido de ":" y un nombre en CAPS
  const ROL_RE =
    /\b(ADM\.?\s*(?:SOLID\.?|MANCOM\.?|UNICO\.?|SUSTITUT\.?)?|ADMINISTRADOR(?:\s+(?:SOLIDARIO|MANCOMUNADO|UNICO|SUSTITUTO))?|APODERADO|CONSEJERO(?:\s+DELEGADO)?|LIQUIDADOR|DIRECTOR(?:\s+GENERAL)?|SECRETARIO)\s*:?\s*([A-Z][A-Z ]{4,60}?)(?=\s*[;.,()\d]|$)/g;

  let m: RegExpExecArray | null;
  while ((m = ROL_RE.exec(t)) !== null) {
    // Ignorar si este match está dentro de una sección de revocación/cese
    if (!isPositiveContext(m.index)) continue;

    const rolRaw = m[1].trim();
    const namesPart = m[2];

    const names = namesPart.split(";").map((n) => n.trim());
    for (const rawName of names) {
      const name = rawName.replace(/[.,;]+$/, "").trim();
      if (!isLikelyPersonName(name)) continue;
      result.push({ nombreNorm: name, rol: normalizeRol(rolRaw) });
    }
  }

  return result;
}

function normalizeRol(raw: string): string | null {
  const r = raw.toUpperCase().replace(/\s+/g, " ").trim();
  if (/ADM.*SOLID|ADMINISTRADOR.*SOLIDARIO/.test(r)) return "administrador_solidario";
  if (/ADM.*MANCOM|ADMINISTRADOR.*MANCOMUNADO/.test(r)) return "administrador_mancomunado";
  if (/ADM.*UNICO|ADMINISTRADOR.*UNICO/.test(r)) return "administrador_unico";
  if (/ADM|ADMINISTRADOR/.test(r)) return "administrador";
  if (/APODERADO/.test(r)) return "apoderado";
  if (/CONSEJERO\s*DELEGADO/.test(r)) return "consejero_delegado";
  if (/CONSEJERO/.test(r)) return "consejero";
  if (/LIQUIDADOR/.test(r)) return "liquidador";
  if (/DIRECTOR/.test(r)) return "director";
  return null;
}

export async function GET() {
  try {
    // Solo alertas de nombramiento
    const alertas = await prisma.bormeAlerta.findMany({
      where: {
        tipoActo: { in: ["nombramiento", "nombramiento_grupo"] },
        descripcion: { not: null },
      },
      select: {
        empresaId: true,
        descripcion: true,
        fecha: true,
        empresa: {
          select: {
            id: true,
            nombre: true,
            grupoId: true,
            enPerimetro: true,
            ccaa: true,
            provincia: true,
            sector: true,
            web: true,
            grupo: { select: { nombre: true } },
            financieros: {
              orderBy: { anio: "desc" },
              take: 1,
              select: { anio: true, ingresos: true, ebitda: true, margenBruto: true },
            },
          },
        },
      },
      orderBy: { fecha: "desc" },
    });

    // Acumular personas → Map<nombreNorm, Map<empresaId, PersonaEnEmpresa>>
    const personaMap = new Map<
      string,
      Map<number, PersonaEnEmpresa & { fechaDate: Date }>
    >();

    for (const alerta of alertas) {
      const personas = extractPersonasFromDesc(alerta.descripcion ?? "");
      for (const { nombreNorm, rol } of personas) {
        if (KNOWN_PERSONS_NORM.has(nombreNorm)) continue;

        if (!personaMap.has(nombreNorm)) {
          personaMap.set(nombreNorm, new Map());
        }
        const empresasMap = personaMap.get(nombreNorm)!;

        const eid = alerta.empresa.id;
        const existing = empresasMap.get(eid);
        if (!existing || alerta.fecha > existing.fechaDate) {
          const fin = alerta.empresa.financieros[0] ?? null;
          const ingresos = fin?.ingresos ?? null;
          const ebitda = fin?.ebitda ?? null;
          const margenBruto = fin?.margenBruto ?? null;
          empresasMap.set(eid, {
            empresaId: eid,
            empresaNombre: alerta.empresa.nombre,
            grupoNombre: alerta.empresa.grupo?.nombre ?? null,
            grupoId: alerta.empresa.grupoId,
            enPerimetro: alerta.empresa.enPerimetro,
            ccaa: alerta.empresa.ccaa,
            provincia: alerta.empresa.provincia,
            sector: alerta.empresa.sector,
            web: alerta.empresa.web,
            rol,
            ultimaFecha: alerta.fecha.toISOString(),
            fechaDate: alerta.fecha,
            ingresos,
            ebitda,
            ebitdaPct:
              ingresos && ebitda
                ? Math.round((ebitda / ingresos) * 1000) / 10
                : null,
            margenBruto,
            margenBrutoPct:
              ingresos && margenBruto
                ? Math.round((margenBruto / ingresos) * 1000) / 10
                : null,
            anioFinanciero: fin?.anio ?? null,
          });
        }
      }
    }

    // Filtrar: solo personas en 2+ empresas distintas
    const results: PersonaCompartida[] = [];
    personaMap.forEach((empresasMap, nombreNorm) => {
      if (empresasMap.size < 2) return;

      const empresas: PersonaEnEmpresa[] = [];
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      empresasMap.forEach(({ fechaDate: _fd, ...rest }) => {
        empresas.push(rest);
      });
      empresas.sort(
        (a, b) =>
          new Date(b.ultimaFecha).getTime() - new Date(a.ultimaFecha).getTime()
      );

      results.push({
        nombreNorm,
        numEmpresas: empresas.length,
        ultimaAparicion: empresas[0].ultimaFecha,
        empresas,
      });
    });

    results.sort(
      (a, b) =>
        b.numEmpresas - a.numEmpresas ||
        new Date(b.ultimaAparicion).getTime() -
          new Date(a.ultimaAparicion).getTime()
    );

    return NextResponse.json({ personas: results, total: results.length });
  } catch (err) {
    console.error("[borme/personas-compartidas] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
