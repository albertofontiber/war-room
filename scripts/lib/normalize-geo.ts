/**
 * normalize-geo.ts
 * Normaliza nombres de CCAA y provincias españolas a su forma canónica oficial.
 *
 * Problemas que resuelve:
 *   - SABI pone artículos al final: "Rioja, La" → "La Rioja"
 *   - Mayúsculas: "ANDALUCÍA" / "andalucia" → "Andalucía"
 *   - Sin tilde: "Aragon" → "Aragón"
 *   - Nombres alternativos: "Islas Baleares" → "Illes Balears"
 */

// ─── Utilidades internas ──────────────────────────────────────────────────

/** Quita tildes y pasa a minúsculas para comparación */
function normKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * SABI invierte artículos: "Rioja, La" → "La Rioja"
 * También: "Coruña, A" → "A Coruña"
 */
function flipArticle(s: string): string {
  const m = s.match(/^(.+?),\s*(la|el|los|las|les|a|os|as)\s*$/i);
  if (m) return `${m[2]} ${m[1]}`.replace(/\s+/g, " ").trim();
  return s;
}

function lookup(map: Record<string, string>, raw: string): string | null {
  const flipped = flipArticle(raw.trim());
  const key = normKey(flipped);
  return map[key] ?? null;
}

// ─── Mapa CCAA ────────────────────────────────────────────────────────────
// Clave: normKey(variante) → valor: nombre canónico

const CCAA_MAP: Record<string, string> = {};

function addCCAA(canonical: string, ...variants: string[]) {
  const all = [canonical, ...variants];
  for (const v of all) {
    CCAA_MAP[normKey(flipArticle(v))] = canonical;
  }
}

addCCAA("Andalucía",
  "ANDALUCIA", "ANDALUCÍA", "Andalucia", "andalucia");

addCCAA("Aragón",
  "ARAGON", "ARAGÓN", "Aragon");

addCCAA("Asturias",
  "ASTURIAS", "PRINCIPADO DE ASTURIAS", "Principado de Asturias");

addCCAA("Illes Balears",
  "BALEARES", "ISLAS BALEARES", "ILLES BALEARS", "Baleares", "Islas Baleares",
  "Balears", "Balears, Illes", "Illes Balears");

addCCAA("Canarias",
  "CANARIAS", "ISLAS CANARIAS", "Islas Canarias");

addCCAA("Cantabria",
  "CANTABRIA");

addCCAA("Castilla-La Mancha",
  "CASTILLA LA MANCHA", "CASTILLA-LA MANCHA", "Castilla La Mancha",
  "Castilla la Mancha", "CASTILLA LA MANCHA");

addCCAA("Castilla y León",
  "CASTILLA Y LEON", "CASTILLA Y LEÓN", "Castilla y Leon",
  "Castilla y León", "CASTILLA-LEON", "CASTILLA LEON");

addCCAA("Cataluña",
  "CATALUNA", "CATALUÑA", "CATALUNYA", "Catalunya", "Cataluña",
  "Catalonia");

addCCAA("Extremadura",
  "EXTREMADURA");

addCCAA("Galicia",
  "GALICIA", "GALIZA");

addCCAA("La Rioja",
  "RIOJA", "LA RIOJA", "Rioja", "Rioja, La", "RIOJA, LA");

addCCAA("Madrid",
  "MADRID", "COMUNIDAD DE MADRID", "Comunidad de Madrid");

addCCAA("Murcia",
  "MURCIA", "REGION DE MURCIA", "REGIÓN DE MURCIA",
  "Region de Murcia", "Región de Murcia");

addCCAA("Navarra",
  "NAVARRA", "COMUNIDAD FORAL DE NAVARRA", "Comunidad Foral de Navarra",
  "NAFARROA");

addCCAA("País Vasco",
  "PAIS VASCO", "PAÍS VASCO", "EUSKADI", "Euskadi", "Pais Vasco",
  "Basque Country", "BASQUE COUNTRY");

addCCAA("C. Valenciana",
  "COMUNIDAD VALENCIANA", "COMUNITAT VALENCIANA", "VALENCIA",
  "Comunidad Valenciana", "Comunitat Valenciana", "Valencia",
  "C. VALENCIANA", "C.VALENCIANA");

addCCAA("Ceuta", "CEUTA");
addCCAA("Melilla", "MELILLA");

// ─── Mapa Provincias ──────────────────────────────────────────────────────

const PROV_MAP: Record<string, string> = {};

function addProv(canonical: string, ...variants: string[]) {
  const all = [canonical, ...variants];
  for (const v of all) {
    PROV_MAP[normKey(flipArticle(v))] = canonical;
  }
}

// Andalucía
addProv("Almería",    "ALMERIA", "ALMERÍA", "Almeria");
addProv("Cádiz",      "CADIZ", "CÁDIZ");
addProv("Córdoba",    "CORDOBA", "CÓRDOBA", "Cordoba");
addProv("Granada",    "GRANADA");
addProv("Huelva",     "HUELVA");
addProv("Jaén",       "JAEN", "JAÉN", "Jaen");
addProv("Málaga",     "MALAGA", "MÁLAGA", "Malaga");
addProv("Sevilla",    "SEVILLA");

// Aragón
addProv("Huesca",     "HUESCA");
addProv("Teruel",     "TERUEL");
addProv("Zaragoza",   "ZARAGOZA");

// Asturias
addProv("Asturias",   "ASTURIAS", "OVIEDO");

// Illes Balears
addProv("Illes Balears", "BALEARES", "ISLAS BALEARES", "ILLES BALEARS",
  "Baleares", "Islas Baleares", "Balears, Illes");

// Canarias
addProv("Las Palmas",              "LAS PALMAS", "Palmas, Las", "PALMAS, LAS");
addProv("Santa Cruz de Tenerife",  "TENERIFE", "SANTA CRUZ DE TENERIFE",
  "Tenerife", "Santa Cruz Tenerife");

// Cantabria
addProv("Cantabria",  "CANTABRIA", "SANTANDER");

// Castilla-La Mancha
addProv("Albacete",   "ALBACETE");
addProv("Ciudad Real","CIUDAD REAL");
addProv("Cuenca",     "CUENCA");
addProv("Guadalajara","GUADALAJARA");
addProv("Toledo",     "TOLEDO");

// Castilla y León
addProv("Ávila",      "AVILA", "ÁVILA", "Avila");
addProv("Burgos",     "BURGOS");
addProv("León",       "LEON", "LEÓN", "Leon");
addProv("Palencia",   "PALENCIA");
addProv("Salamanca",  "SALAMANCA");
addProv("Segovia",    "SEGOVIA");
addProv("Soria",      "SORIA");
addProv("Valladolid", "VALLADOLID");
addProv("Zamora",     "ZAMORA");

// Cataluña
addProv("Barcelona",  "BARCELONA");
addProv("Girona",     "GIRONA", "GERONA", "Gerona");
addProv("Lleida",     "LLEIDA", "LERIDA", "LÉRIDA", "Lerida", "Lérida");
addProv("Tarragona",  "TARRAGONA");

// Extremadura
addProv("Badajoz",    "BADAJOZ");
addProv("Cáceres",    "CACERES", "CÁCERES", "Caceres");

// Galicia
addProv("A Coruña",   "A CORUÑA", "LA CORUÑA", "CORUÑA", "Coruña, A",
  "CORUÑA, A", "La Coruña", "Coruña");
addProv("Lugo",       "LUGO");
addProv("Ourense",    "OURENSE", "ORENSE", "Orense");
addProv("Pontevedra", "PONTEVEDRA");

// La Rioja
addProv("La Rioja",   "RIOJA", "LA RIOJA", "Rioja", "Rioja, La", "RIOJA, LA",
  "La rioja");

// Madrid
addProv("Madrid",     "MADRID");

// Murcia
addProv("Murcia",     "MURCIA");

// Navarra
addProv("Navarra",    "NAVARRA", "NAFARROA");

// País Vasco
addProv("Álava",      "ALAVA", "ÁLAVA", "Alava", "ARABA");
addProv("Guipúzcoa",  "GUIPUZCOA", "GUIPÚZCOA", "Guipuzcoa", "GIPUZKOA", "Gipuzkoa", "Guipuzkoa", "GUIPUZKOA");
addProv("Vizcaya",    "VIZCAYA", "BIZKAIA", "Bizkaia");

// C. Valenciana
addProv("Alicante",   "ALICANTE", "ALACANT");
addProv("Castellón",  "CASTELLON", "CASTELLÓN", "Castellon", "CASTELLÓ", "Castello");
addProv("Valencia",   "VALENCIA");

// Ciudades autónomas
addProv("Ceuta",  "CEUTA");
addProv("Melilla","MELILLA");

// ─── Funciones exportadas ─────────────────────────────────────────────────

export function normalizeCCAA(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const result = lookup(CCAA_MAP, raw);
  if (!result) {
    console.warn(`    ⚠️  CCAA no reconocida: "${raw}" — se guarda tal cual`);
    // Fallback: title case con artículo corregido
    return flipArticle(raw.trim()).replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return result;
}

export function normalizeProvincia(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const result = lookup(PROV_MAP, raw);
  if (!result) {
    console.warn(`    ⚠️  Provincia no reconocida: "${raw}" — se guarda tal cual`);
    return flipArticle(raw.trim()).replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return result;
}

export function normalizeLocalidad(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Localidad: solo corregir artículo invertido y title case
  const flipped = flipArticle(raw.trim());
  return flipped.replace(/\b\w/g, (c) => c.toUpperCase());
}
