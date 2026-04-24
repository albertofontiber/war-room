import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Raw CEPREVEN member list scraped from cepreven.com/asociados/listado (2026-04-06)
const CEPREVEN_MEMBERS = [
  "3F Ingeniería Mantenimiento, S.L.",
  "9TEKNIC GRUP SISTEMES DE SEGURETAT, S.L.",
  "A-EX AUTOEXTINCIÓN, S.L.",
  "AAS INCENDIO, S.L.",
  "AF PROTECCIÓN S.L.",
  "AGUILERA EXTINCIÓN S.L.U.",
  "AICON SISTEMAS, S.L.",
  "AIG EUROPE, S.A. Sucursal en España",
  "AIR FEU, S.L.",
  "AIRSEXT SERVICIOS CONTRA INCENDIOS REGIONALES SL",
  "ALFA BS",
  "ALLIANZ, Cía. de Seguros y Reaseguros, S.A.",
  "ALONSO ESCURIS, S.L.",
  "ALTER TECHNOLOGY TÜV NORD S.A.U.",
  "AON",
  "APAGAL SEGURIDAD Y PROTECCIÓN CONTRA INCENDIOS, S.L.",
  "APER SEGURIDAD, S.L.",
  "APLITER",
  "APT INSTALACIONES, S.L.",
  "ARAISA SEGURIDAD, S.L.",
  "ARCE CLIMA SISTEMAS Y APLICACIONES, S.L.",
  "AXA SEGUROS GENERALES, S.A. DE SEGUROS Y REASEGUROS",
  "AXA XL Risk consulting",
  "BALSAMAR SERVICES 2000, S.L.",
  "BIFAN IBÉRICA SEGURIDAD, S.L.",
  "CASER, S.A.",
  "CATALANA DE SEGURETAT I COMUNICACIONS, S.L.",
  "CEMOEL, S.L.",
  "CEVA Logistics España, S.L.",
  "CHACARREX, S.L.",
  "CHEPRO",
  "CHUBB IBERIA, S.L.",
  "COINSE",
  "COMERCIAL ENERSIS",
  "COPERSA",
  "CORTEVA AGRISCIENCE SPAIN, S.L.U.",
  "COSMOS PROTECCIÓN CONTRA INCENDIOS, S.L.",
  "COTTES Fire Smoke Solutions, S.L.",
  "CV INSTALACIONES",
  "DANMUR INSTALACIONES, S.L.",
  "DEMASERVICE PROYECTOS INTEGRALES S.L.",
  "DEMCO MONTAJES, S.L.",
  "DETECTA PROTECCIÓN CONTRA INCENDIOS, S.L.",
  "DETNOV SECURITY, S.L.",
  "DEXTINSUR, S.L.",
  "DINAK, S.A.",
  "DREXMIN, S.L.",
  "E.A.G. SEGURIDAD, S.L.",
  "E2K GLOBAL BUSINESS SOLUTIONS, S.A.",
  "EACI, S.A.",
  "EASY DETECT, S.L.",
  "EBARA PUMPS IBERIA, S.A.",
  "EL CORTE INGLES, S.A.",
  "ELECNOR SEGURIDAD, S.L.",
  "ELECNOR, S.A.",
  "ELITEX PROTECTION, S.L.",
  "ENGINEERED FIRE PIPING, S.L.",
  "ESPARPLANT, S.L.",
  "EUROFESA, S.A.",
  "EXIA PROTECCION CONTRA INCENDIO, S.L.",
  "EXTINCONTROL 4, S.L.",
  "EXTINGIL S.L.L.",
  "EXTINIRUÑA S.L.",
  "EXTINORTE, S.L.",
  "EXTINTORES ORIGEN, S.L.U",
  "Falck SCI, S.A.",
  "FILINOX, S.A.",
  "FIRE BUSINESS S.L.",
  "FIRE CONSULT, S.L.",
  "FIRE GLOBAL SOLUTIONS, S.L.",
  "FIRE-PROT, S.A.",
  "FIREX, S.L.",
  "FM Insurance Europe, Suc. España",
  "FOCSA CONTRA INCENDIOS, S.L.",
  "FRANCISCO AZNAR MOLLÁ",
  "GAROTECNIA, S.A.",
  "GEA QUALITY, S.L.U.",
  "GENERAL PUMPS, S.L.U.",
  "GENERAL REINSURANCE AG, Sucursal en España",
  "GENERALI ESPAÑA, S.A. de Seguros y Reaseguros",
  "GES SEGUROS Y REASEGUROS, S.A.",
  "GRUCOMAN",
  "HELVETIA COMPAÑÍA SUIZA, S.A. DE SEGUROS Y REASEGUROS",
  "HILTI ESPAÑOLA, S.A.",
  "HISPANIA PROTECCIÓN Y SEGURIDAD, S.L.",
  "HONEYWELL LIFE SAFETY IBERIA, S.L.",
  "HUAWEI TECHNOLOGIES España S.L.",
  "HUURRE IBÉRICA, S.A.",
  "IALEC, S.L.",
  "IBEREXT, S.A.",
  "IC-10 PROYECTOS TÉCNICOS Y CONSTRUCCIONES S.L.",
  "IKRAN MANAGEMENT SERVICES, SL",
  "IMPULSO INDUSTRIAL ALTERNATIVO, S.A.",
  "INGENIERÍA SCHILLING, S.L.",
  "INGENIERIA, PROYECTOS & CONSULTING LANZA S.L.",
  "INMAREPRO, S.L.",
  "INOVA INGENIEROS S.L.P.",
  "INSEGA 2020, S.L.",
  "INSERPYME GLOBAL, S.A.",
  "INSTALACIONES HERFER, S.L.",
  "INSTALACIONES MANUEL GARCÍA, S.L.",
  "INSTRA INGENIEROS, S.L.",
  "INTACT INSURANCE EUROPE S.A",
  "INTEGRAS",
  "INTERFUEGO SEGURIDAD, S.L.",
  "IRONOR METALURGIA, S.L.",
  "ISART Instalaciones y equipamiento de seguridad, S.L.U.",
  "ISOPAN IBÉRICA, S.L.",
  "ITM",
  "J. JUNQUERA LLANEZA INGENIERÍA, S.L.P.",
  "J2L MEP CONSULTING SLP",
  "JOMAR SEGURIDAD, S.L.",
  "KINGSPAN LIGHT AND AIR SPAIN, S.A.U.",
  "KREAN S. Coop.",
  "KSB ITUR Spain, S.A.",
  "LAESS SEGURIDAD",
  "LEHENGOAK BABES INGENIARITZA, S.L.",
  "LIFTISA, S.L.",
  "LIKITECH EQUIPOS CONTRA INCENDIOS, S.L.U.",
  "LIQUID CONTAINMENT & FLOOD TECHNOLOGIES",
  "LOCK SEGURIDAD, S.L.",
  "LUMEGA TECNOLOXIA E SOLUCIONS CONTRA INCENDIOS, S.L",
  "MAIDER, S.L.",
  "MANIX INTEGRAL, S.L.",
  "MANN+HUMMEL IBÉRICA, S.A.U.",
  "MANUELA CONEJERO",
  "MAPFRE ESPAÑA, S.A.",
  "MARIOFF HI-FOG S.L.U.",
  "MASQUEINGENIEROS ENGINEERING & CONSULTING, S.L.",
  "MCI COSMOS, S.L.",
  "METAL QUALITY INSTALACIONES, S.L.U.",
  "MGS Seguros y Reaseguros, S.A.",
  "MINTEC Ingeniería e Instalaciones, S.L.",
  "MUNICH RE Sucursal en España",
  "NERVION INDUSTRIES ENGINEERING AND SERVICES SL",
  "NM FIRE IBERIA, S.L.U.",
  "NORDÉS ANCÍN, S.A.",
  "NUEVAS LÍNEAS DE EXTINCIÓN, S.L.",
  "NUEVAS TECNOLOGÍAS CONTRA INCENDIOS, S.L.",
  "OCCIDENT GCO, S.A.U. de Seguros y Reaseguros",
  "ONDOAN S. COOP.",
  "PACISA",
  "PCI CLIMA, S.L.",
  "PCI KOSMOS GROUP, S.A.",
  "PEFIPRESA",
  "PREFIRE, S.L.",
  "PREPERSA",
  "PRODEIN, S.L.",
  "PROINDECSA, S.L.",
  "PROITEC SISTEMAS, S.L.",
  "PROMAT IBERICA, S.A.",
  "PROSEGUR ESPAÑA, S.L.",
  "PROTEC FIRE DETECTION SPAIN, S.L.",
  "PROTECCION Y ELECTRONICA DEL SUR SL",
  "PROTEL SYSTEMS SL",
  "PROYECT 435, S.L.",
  "Proyectos contra Incendios GOBAN 4, S.L.",
  "QUALITY Soluciones y Proyectos, S.L.",
  "REALE SEGUROS GENERALES, S.A.",
  "RIMEGRA EXTINCIÓN, S.L.",
  "RODICH SEGURIDAD Y SISTEMAS SL",
  "RUHER Ingenieros, S.L.",
  "SABICO SEGURIDAD, S.A.",
  "SAIMA SEGURIDAD, S.A.",
  "SCOR SE, Sucursal en España",
  "SEAMP STA S.L.",
  "SECURITAS SEGURIDAD ESPAÑA, S.A.",
  "SEGURIDAD ABEX, S.L.",
  "SEGURIDAD INTEGRAL SECOEX, S.A.",
  "SEGURLEM",
  "SEICOR INSTALACIONES Y SERVICIOS, S.L.",
  "SEMAMCOIN, S.L.",
  "SERCOIN SISTEMAS DE SEGURIDAD, S.A.U.",
  "Servicios Técnicos CEPRETEC, S.L.",
  "SEVO SYSTEMS EUROPE, S.L.",
  "SICI",
  "SIEMENS, S.A.",
  "SIEX 2001, S.L.",
  "SINALUX & MASTERLUX, S.L.",
  "SISTEMA 1, S.L.",
  "SISTEMAS DE CONTROL, SEGURIDAD Y EXTINCIÓN, S.L.U.",
  "SISTEMAS TÉCNICOS CONTRAINCENDIOS",
  "SLEVING Fire & Security, S.L.",
  "SODECA, S.L.",
  "SOLER PREVENCION Y SEGURIDAD, S.A.",
  "SPG Fire & Seurity",
  "SPV SISTEMAS, S.A.",
  "STAR Protectos y Montajes, S.L.U.",
  "STOEBICH IBERICA, S.L.",
  "SUPRA SEGURIDAD, S.L.U.",
  "SURIS, S.L.",
  "SVE Corp",
  "SWISS FIRE SPAIN S.L.",
  "SYSTEMS FIRE PROYECT, S.L.",
  "T.P. INSTALACIONES, S.L.",
  "TÁCTICA SOLUCIONES INTEGRALES, S.L.",
  "TASC, S.L.",
  "TAVER CUALITAS, SAU",
  "TECNITEX FIRE SYSTEMS, S.L.",
  "TECNO SEGURETAT ANOIA, S.L.",
  "TESEIN, S.A.",
  "TQ · INCENDIOS, S.L.",
  "TRAMITA INGENIERÍA, S.L.P.",
  "TRAZOS INGENIERÍA Y CONSULTORÍA, S.L.",
  "TRIA, Fire & Smoke Solutions, S.L.",
  "TROIA, S.L.",
  "TUBASYS, S.L.U.",
  "TYCO Building Services Products",
  "UNEX APARELLAJE ELÉCTRICO, S.L.",
  "VANTEVO CLAIMS ADVISORS SPAIN, S.L.",
  "VIKING SPRINKLER, S.A.",
  "ZURICH Insurance Europe AG, Sucursal en España",
];

/**
 * Normalize a company name for fuzzy matching:
 * - uppercase
 * - remove accents
 * - strip legal suffixes (S.L., S.A., S.L.U., etc.)
 * - remove punctuation
 * - collapse whitespace
 */
function normName(raw: string): string {
  return raw
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(S\.?L\.?U?\.?|S\.?A\.?U?\.?|S\.?L\.?L\.?|S\.?COOP\.?|S\.?L\.?P\.?|SLP|SLU|SAU)\b/gi, "")
    .replace(/[.,;:·\-&'""()\[\]\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract "core" name — first 2-3 significant words for loose matching
 */
function coreTokens(norm: string): string[] {
  const STOPWORDS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "EL", "Y", "E", "EN", "SUCURSAL", "ESPAÑA", "CIA", "COMPANIA"]);
  return norm.split(" ").filter(t => t.length > 1 && !STOPWORDS.has(t));
}

async function main() {
  // Load all empresas
  const empresas = await prisma.empresa.findMany({
    select: { id: true, nombre: true, cepreven: true },
  });

  console.log(`Total empresas en BD: ${empresas.length}`);
  console.log(`Miembros CEPREVEN a matchear: ${CEPREVEN_MEMBERS.length}`);
  console.log("---");

  // Build lookup maps
  const normToEmpresas = new Map<string, typeof empresas>();
  const coreToEmpresas = new Map<string, typeof empresas>();

  for (const emp of empresas) {
    const n = normName(emp.nombre);
    if (!normToEmpresas.has(n)) normToEmpresas.set(n, []);
    normToEmpresas.get(n)!.push(emp);

    const core = coreTokens(n).slice(0, 3).join(" ");
    if (core.length > 3) {
      if (!coreToEmpresas.has(core)) coreToEmpresas.set(core, []);
      coreToEmpresas.get(core)!.push(emp);
    }
  }

  // False positives from substring/core matching — exclude these
  const FALSE_POSITIVES = new Set([
    4448, // CASER → DECASERVI (wrong)
    3155, // COINSE → INCOINSER (wrong)
    1254, // EACI → CONDUCTOS DE AIREACION VIZCAYA (wrong)
  ]);

  const matched: { membName: string; empresa: { id: number; nombre: string }; method: string }[] = [];
  const unmatched: string[] = [];

  for (const member of CEPREVEN_MEMBERS) {
    const n = normName(member);

    // 1. Exact normalized match
    if (normToEmpresas.has(n)) {
      const hits = normToEmpresas.get(n)!.filter(e => !FALSE_POSITIVES.has(e.id));
      if (hits.length > 0) {
        matched.push({ membName: member, empresa: hits[0], method: "exact" });
        continue;
      }
    }

    // 2. Core tokens match (first 3 tokens)
    const core = coreTokens(n).slice(0, 3).join(" ");
    if (core.length > 3 && coreToEmpresas.has(core)) {
      const hits = coreToEmpresas.get(core)!.filter(e => !FALSE_POSITIVES.has(e.id));
      if (hits.length === 1) {
        matched.push({ membName: member, empresa: hits[0], method: "core" });
        continue;
      }
    }

    // 3. Substring match — requires at least 2 tokens and main word >4 chars
    const tokens = coreTokens(n);
    const mainWord = tokens[0];
    if (mainWord && mainWord.length > 4 && tokens.length >= 2) {
      const candidates = empresas.filter(e => {
        if (FALSE_POSITIVES.has(e.id)) return false;
        const en = normName(e.nombre);
        return en.includes(mainWord) && tokens.slice(0, 2).every(t => en.includes(t));
      });
      if (candidates.length === 1) {
        matched.push({ membName: member, empresa: candidates[0], method: "substring" });
        continue;
      }
    }

    unmatched.push(member);
  }

  console.log(`\n✅ MATCHED: ${matched.length}`);
  for (const m of matched) {
    console.log(`  [${m.method}] "${m.membName}" → id=${m.empresa.id} "${m.empresa.nombre}"`);
  }

  console.log(`\n❌ UNMATCHED: ${unmatched.length}`);
  for (const u of unmatched) {
    console.log(`  "${u}"`);
  }

  // Ask for confirmation
  console.log(`\n--- DRY RUN — no changes made ---`);
  console.log(`Para aplicar: ejecuta con --apply`);

  if (process.argv.includes("--apply")) {
    const ids = matched.map(m => m.empresa.id);
    const result = await prisma.empresa.updateMany({
      where: { id: { in: ids } },
      data: { cepreven: true },
    });
    console.log(`\n✅ Actualizado cepreven=true para ${result.count} empresas`);
  }

  await prisma.$disconnect();
}

main();
