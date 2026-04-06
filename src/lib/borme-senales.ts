/**
 * borme-senales.ts
 * Catálogo de señales conocidas por grupo para el clasificador BORME.
 *
 * Cómo añadir un grupo nuevo:
 *   1. Añadir una entrada a GRUPOS_SENALES
 *   2. `personas`: nombres en MAYÚSCULAS sin diacríticos (igual que normalizeNombre)
 *   3. `keywordsDenominacion`: substrings a buscar en actos de cambio de denominación
 *   4. `keywordsSocioUnico`: substrings a buscar en "Socio único: X" o "unipersonal"
 *   5. Ejecutar `npx ts-node scripts/borme-backfill-grupos.ts` para reclasificar
 */

export interface GrupoSenales {
  grupoNombre: string;
  /** Nombres normalizados (MAYUSCULAS, sin tildes) de personas clave del grupo */
  personas: string[];
  /** Substrings en denominación que indican adquisición por este grupo */
  keywordsDenominacion: string[];
  /** Substrings en "socio único / unipersonal" que identifican al grupo como adquirente */
  keywordsSocioUnico: string[];
}

/**
 * NOTA sobre normalización de nombres de personas:
 *
 * - El campo `personas` usa formato "búsqueda en texto BORME":
 *   mayúsculas, sin tildes, orden natural (p.ej. "GUITARD MALDONADO ALVARO").
 *   Se busca como substring en el texto del acto via norm().
 *
 * - Para obtener la clave PersonaCargo.nombreNorm equivalente, usar:
 *   import { bormePersonaToCargoKey } from './normalize';
 *   bormePersonaToCargoKey("GUITARD MALDONADO ALVARO") → "ALVARO GUITARD MALDONADO"
 *
 * Cuando Task H escriba nombramientos en PersonaCargo, debe pasar
 * personaDetectada por bormePersonaToCargoKey() para obtener el nombreNorm.
 */
export const GRUPOS_SENALES: GrupoSenales[] = [
  {
    grupoNombre: "Grupo Fire",
    personas: [
      "LUCIANO VILLEN MARTA",
      "ZALA NAVARRO ALEJANDRO",
      "REYES ROMERO LUIS ROBERTO",
      "GUITARD MALDONADO ALVARO",
      "DE LA PASCUA ARAGON PABLO",
    ],
    keywordsDenominacion: ["FIRE BUSINESS"],
    keywordsSocioUnico: ["FIRE BUSINESS"],
  },
  {
    grupoNombre: "Eurofesa",
    personas: [
      "BJURSTROM TOR FILIP",
      "FRANSSON BENGT OLOF JOHAN",
      "FRANSSON OLOF",
      "LOPEZ LOPEZ DAVID",
    ],
    keywordsDenominacion: ["EUROFESA"],
    keywordsSocioUnico: ["EUROFESA"],
  },
  {
    grupoNombre: "Scutum",
    personas: [
      "THIERRY PASCAL HENRI BABULE",
      "BABULE THIERRY PASCAL HENRI",
      "TURCHI PASCAL LUCIEN ELIO ARTHUR",
      "PASCAL TURCHI",
    ],
    keywordsDenominacion: ["SCUTUM"],
    keywordsSocioUnico: ["SCUTUM"],
  },
  {
    grupoNombre: "Attlon",
    personas: [
      "BECKER LARS",
      "URBON GARCIA FUENTES INIGO",
    ],
    keywordsDenominacion: ["ATTLON"],
    keywordsSocioUnico: ["ATTLON TECHNOLOGIES", "ATTLON"],
  },
  {
    grupoNombre: "Plana Fàbrega",
    personas: [],
    keywordsDenominacion: ["PLANA FABREGA", "PLANA FABREGA"],
    keywordsSocioUnico: ["PLANA FABREGA"],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normaliza texto para búsqueda en PDFs BORME: mayúsculas, sin diacríticos,
 * sin puntuación. Solo para detectar substrings en texto libre.
 * NO usar para generar claves PersonaCargo — usar normalizePersona() de normalize.ts.
 */
export function norm(s: string): string {
  return s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface DeteccionGrupo {
  grupoNombre: string;
  personaDetectada: string | null;
  motivo: "persona" | "denominacion" | "socio_unico";
}

/**
 * Busca en el texto de un acto BORME si corresponde a algún grupo conocido.
 * Devuelve la primera coincidencia o null.
 */
export function detectarGrupo(texto: string): DeteccionGrupo | null {
  const t = norm(texto);

  for (const g of GRUPOS_SENALES) {
    // 1. Personas conocidas
    for (const persona of g.personas) {
      if (t.includes(norm(persona))) {
        return { grupoNombre: g.grupoNombre, personaDetectada: persona, motivo: "persona" };
      }
    }

    // 2. Keywords denominación (cambios de nombre)
    const esDenominacion = /DENOMINACION|DENOMINACIÓ/.test(t);
    if (esDenominacion) {
      for (const kw of g.keywordsDenominacion) {
        if (t.includes(norm(kw))) {
          return { grupoNombre: g.grupoNombre, personaDetectada: null, motivo: "denominacion" };
        }
      }
    }

    // 3. Keywords socio único / unipersonalidad
    const esSocioUnico = /SOCIO.UNICO|UNIPERSONAL/.test(t);
    if (esSocioUnico) {
      for (const kw of g.keywordsSocioUnico) {
        if (t.includes(norm(kw))) {
          return { grupoNombre: g.grupoNombre, personaDetectada: null, motivo: "socio_unico" };
        }
      }
    }
  }

  return null;
}
