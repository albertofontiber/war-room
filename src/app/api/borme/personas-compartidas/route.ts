/**
 * GET /api/borme/personas-compartidas
 *
 * Detecta personas que aparecen en cargos de 2+ empresas distintas
 * extrayendo nombres de los textos de BormeAlerta, excluyendo las
 * personas ya conocidas en GRUPOS_SENALES.
 *
 * Criterio de "posible nuevo grupo": la misma persona (nombre normalizado)
 * aparece en actos de nombramiento de 2+ empresas distintas.
 *
 * Limitaciones conocidas:
 *  - Solo detecta nombres explícitos en el texto (patrón "Rol: NOMBRE")
 *  - No distingue ceses de nombramientos (posible mejora futura)
 *  - Puede haber homonimia en nombres comunes
 */

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { GRUPOS_SENALES, norm } from "@/lib/borme-senales";

const prisma = new PrismaClient();

// Personas ya conocidas — se excluyen del análisis
const KNOWN_PERSONS_NORM = new Set(
  GRUPOS_SENALES.flatMap((g) => g.personas).map((p) => norm(p))
);

interface PersonaEnEmpresa {
  empresaId: number;
  empresaNombre: string;
  grupoNombre: string | null;
  rol: string | null;
  ultimaFecha: string;
}

interface PersonaCompartida {
  nombreNorm: string;
  numEmpresas: number;
  ultimaAparicion: string;
  empresas: PersonaEnEmpresa[];
}

/**
 * Extrae pares (nombre_normalizado, rol) de un texto de BormeAlerta.
 * Busca patrones como "Adm. Solid.: APELLIDO1 APELLIDO2 NOMBRE"
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

  const result: Array<{ nombreNorm: string; rol: string | null }> = [];

  // Patrón: rol_abreviado ":" nombre_en_caps (terminado en ";", "." o fin de contexto)
  // Captura roles típicos del Registro Mercantil español
  const ROL_RE =
    /\b(ADM\.?\s*(?:SOLID\.?|MANCOM\.?|UNICO\.?|SUSTITUT\.?)?|ADMINISTRADOR(?:\s+(?:SOLIDARIO|MANCOMUNADO|UNICO|SUSTITUTO))?|APODERADO|CONSEJERO(?:\s+DELEGADO)?|LIQUIDADOR|DIRECTOR(?:\s+GENERAL)?|SECRETARIO)\s*:?\s*([A-Z][A-Z ]{4,60}?)(?=\s*[;.,()\d]|$)/g;

  let m: RegExpExecArray | null;
  while ((m = ROL_RE.exec(t)) !== null) {
    const rolRaw = m[1].trim();
    const namesPart = m[2];

    // Puede haber varios nombres separados por ";"
    const names = namesPart.split(";").map((n) => n.trim());
    for (const rawName of names) {
      const name = rawName.replace(/[.,;]+$/, "").trim();
      const words = name.split(/\s+/).filter((w) => w.length >= 2);

      // Validar: 2–5 palabras, sin palabras clave de BORME
      if (
        words.length < 2 ||
        words.length > 5 ||
        /^(DATOS|REGISTRAL|TOMO|FOLIO|HOJA|INSCRIPCION|SECC)/.test(name)
      ) {
        continue;
      }

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
    // Solo alertas de nombramiento — donde personas adquieren cargos
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
            grupo: { select: { nombre: true } },
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
        // Excluir personas ya identificadas en grupos conocidos
        if (KNOWN_PERSONS_NORM.has(nombreNorm)) continue;

        if (!personaMap.has(nombreNorm)) {
          personaMap.set(nombreNorm, new Map());
        }
        const empresasMap = personaMap.get(nombreNorm)!;

        const eid = alerta.empresa.id;
        const existing = empresasMap.get(eid);
        // Guardar solo la aparición más reciente por empresa
        if (!existing || alerta.fecha > existing.fechaDate) {
          empresasMap.set(eid, {
            empresaId: eid,
            empresaNombre: alerta.empresa.nombre,
            grupoNombre: alerta.empresa.grupo?.nombre ?? null,
            rol,
            ultimaFecha: alerta.fecha.toISOString(),
            fechaDate: alerta.fecha,
          });
        }
      }
    }

    // Filtrar: solo personas en 2+ empresas distintas
    const results: PersonaCompartida[] = [];
    personaMap.forEach((empresasMap, nombreNorm) => {
      if (empresasMap.size < 2) return;

      const empresas: PersonaEnEmpresa[] = [];
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

    // Ordenar: más empresas primero, luego más reciente
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
