// Apply CEPREVEN asociada + calificada to the database
// Run: node scripts/import-cepreven-apply.js

const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

function normName(raw) {
  return raw
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(S\.?L\.?U?\.?|S\.?A\.?U?\.?|S\.?L\.?L\.?|S\.?COOP\.?|S\.?L\.?P\.?|SLP|SLU|SAU)\b/gi, "")
    .replace(/[.,;:·\-&'""()\[\]\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function coreTokens(norm) {
  const STOPWORDS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "EL", "Y", "E", "EN", "SUCURSAL", "ESPAÑA", "CIA", "COMPANIA"]);
  return norm.split(" ").filter(t => t.length > 1 && !STOPWORDS.has(t));
}

function matchMembers(members, empresas, falsePosIds) {
  const normToEmpresas = new Map();
  const coreToEmpresas = new Map();

  for (const emp of empresas) {
    const n = normName(emp.nombre);
    if (!normToEmpresas.has(n)) normToEmpresas.set(n, []);
    normToEmpresas.get(n).push(emp);

    const core = coreTokens(n).slice(0, 3).join(" ");
    if (core.length > 3) {
      if (!coreToEmpresas.has(core)) coreToEmpresas.set(core, []);
      coreToEmpresas.get(core).push(emp);
    }
  }

  const matched = [];
  const unmatched = [];

  for (const member of members) {
    const n = normName(member);

    // 1. Exact
    if (normToEmpresas.has(n)) {
      const hits = normToEmpresas.get(n).filter(e => !falsePosIds.has(e.id));
      if (hits.length > 0) { matched.push({ name: member, id: hits[0].id, dbName: hits[0].nombre, method: "exact" }); continue; }
    }

    // 2. Core
    const core = coreTokens(n).slice(0, 3).join(" ");
    if (core.length > 3 && coreToEmpresas.has(core)) {
      const hits = coreToEmpresas.get(core).filter(e => !falsePosIds.has(e.id));
      if (hits.length === 1) { matched.push({ name: member, id: hits[0].id, dbName: hits[0].nombre, method: "core" }); continue; }
    }

    // 3. Substring (require 2+ tokens, main word >4 chars)
    const tokens = coreTokens(n);
    const mainWord = tokens[0];
    if (mainWord && mainWord.length > 4 && tokens.length >= 2) {
      const candidates = empresas.filter(e => {
        if (falsePosIds.has(e.id)) return false;
        const en = normName(e.nombre);
        return en.includes(mainWord) && tokens.slice(0, 2).every(t => en.includes(t));
      });
      if (candidates.length === 1) { matched.push({ name: member, id: candidates[0].id, dbName: candidates[0].nombre, method: "substring" }); continue; }
    }

    unmatched.push(member);
  }
  return { matched, unmatched };
}

const ASOCIADAS = [
  "9TEKNIC GRUP SISTEMES DE SEGURETAT, S.L.","AAS INCENDIO, S.L.","AF PROTECCIÓN S.L.",
  "AGUILERA EXTINCIÓN S.L.U.","AICON SISTEMAS, S.L.","AIR FEU, S.L.",
  "AIRSEXT SERVICIOS CONTRA INCENDIOS REGIONALES SL","APAGAL SEGURIDAD Y PROTECCIÓN CONTRA INCENDIOS, S.L.",
  "APER SEGURIDAD, S.L.","APT INSTALACIONES, S.L.","ARAISA SEGURIDAD, S.L.",
  "ARCE CLIMA SISTEMAS Y APLICACIONES, S.L.","BALSAMAR SERVICES 2000, S.L.",
  "BIFAN IBÉRICA SEGURIDAD, S.L.","CATALANA DE SEGURETAT I COMUNICACIONS, S.L.",
  "CEMOEL, S.L.","CHACARREX, S.L.","CHUBB IBERIA, S.L.",
  "COSMOS PROTECCIÓN CONTRA INCENDIOS, S.L.","DANMUR INSTALACIONES, S.L.",
  "DEMASERVICE PROYECTOS INTEGRALES S.L.","DEMCO MONTAJES, S.L.",
  "DETECTA PROTECCIÓN CONTRA INCENDIOS, S.L.","DEXTINSUR, S.L.","DREXMIN, S.L.",
  "ELECNOR SEGURIDAD, S.L.","ELECNOR, S.A.","EUROFESA, S.A.",
  "EXIA PROTECCION CONTRA INCENDIO, S.L.","EXTINCONTROL 4, S.L.","EXTINIRUÑA S.L.",
  "EXTINTORES ORIGEN, S.L.U","Falck SCI, S.A.","FIRE BUSINESS S.L.",
  "FIRE CONSULT, S.L.","FIRE-PROT, S.A.","FIREX, S.L.","FOCSA CONTRA INCENDIOS, S.L.",
  "GAROTECNIA, S.A.","GEA QUALITY, S.L.U.","HISPANIA PROTECCIÓN Y SEGURIDAD, S.L.",
  "IALEC, S.L.","IBEREXT, S.A.","IC-10 PROYECTOS TÉCNICOS Y CONSTRUCCIONES S.L.",
  "IKRAN MANAGEMENT SERVICES, SL","INMAREPRO, S.L.","INSEGA 2020, S.L.",
  "INSERPYME GLOBAL, S.A.","INSTALACIONES HERFER, S.L.","INTERFUEGO SEGURIDAD, S.L.",
  "JOMAR SEGURIDAD, S.L.","KINGSPAN LIGHT AND AIR SPAIN, S.A.U.",
  "LEHENGOAK BABES INGENIARITZA, S.L.","MANIX INTEGRAL, S.L.","MARIOFF HI-FOG S.L.U.",
  "MCI COSMOS, S.L.","MINTEC Ingeniería e Instalaciones, S.L.","NORDÉS ANCÍN, S.A.",
  "NUEVAS TECNOLOGÍAS CONTRA INCENDIOS, S.L.","PCI KOSMOS GROUP, S.A.","PEFIPRESA",
  "PREFIRE, S.L.","PROITEC SISTEMAS, S.L.","PROTECCION Y ELECTRONICA DEL SUR SL",
  "PROTEL SYSTEMS SL","Proyectos contra Incendios GOBAN 4, S.L.",
  "QUALITY Soluciones y Proyectos, S.L.","RIMEGRA EXTINCIÓN, S.L.",
  "RODICH SEGURIDAD Y SISTEMAS SL","RUHER Ingenieros, S.L.","SABICO SEGURIDAD, S.A.",
  "SAIMA SEGURIDAD, S.A.","SEAMP STA S.L.","SECURITAS SEGURIDAD ESPAÑA, S.A.",
  "SEGURIDAD ABEX, S.L.","SEGURIDAD INTEGRAL SECOEX, S.A.","SEGURLEM",
  "SEICOR INSTALACIONES Y SERVICIOS, S.L.","SEMAMCOIN, S.L.",
  "SERCOIN SISTEMAS DE SEGURIDAD, S.A.U.","SIEMENS, S.A.",
  "SLEVING Fire & Security, S.L.","SOLER PREVENCION Y SEGURIDAD, S.A.",
  "SPV SISTEMAS, S.A.","SUPRA SEGURIDAD, S.L.U.","SURIS, S.L.",
  "SWISS FIRE SPAIN S.L.","TÁCTICA SOLUCIONES INTEGRALES, S.L.",
  "TECNITEX FIRE SYSTEMS, S.L.","TECNO SEGURETAT ANOIA, S.L.",
  "TYCO Building Services Products",
];

const CALIFICADAS = [
  "AIR FEU, S.L.","ARCE CLIMA SISTEMAS Y APLICACIONES","BIFAN IBERICA SEGURIDAD S.L.U.",
  "CATALANA DE SEGURETAT I COMUNICACIONS, S.L.","CHACARREX, S.L.",
  "CHUBB IBERIA","CV INSTALACIONES","DANMUR INSTALACIONES","DEMCO MONTAJES S.L",
  "ESPARPLANT, S.L.","EXIA PROTECCION CONTRA INCENDIO, S.L.","EXTINTORES ORIGEN, S.L.U.",
  "FIRE BUSINESS","FIRE CONSULT, S.L.","GRUPO EUROFESA",
  "IALEC, S.L.","IBEREXT, S.A.","JOMAR SEGURIDAD, S.L.","MANIX INTEGRAL, S.L",
  "Manuela Conejero, Riesgo Cero en Incendios","MARIOFF HI-FOG, SLU",
  "NTCI Nuevas Tecnologías Contra Incendios, S.L","PACISA","PCI CLIMA",
  "PEFIPRESA","PREFIRE, S.L.","PROSEGUR SIS ESPAÑA, S.L.",
  "SECURITAS SEGURIDAD España, S.A.","SIEMENS, S.A.",
  "SOLER PREVENCIÓN Y SEGURIDAD","SUPRA SEGURIDAD, S.L","SURIS, S.L.",
  "TESEIN, S.A.",
  // Additional from the list
  "ELECNOR SERVICIOS Y PROYECTOS, S.A.U",
  "ONDOAN S.COOP.",
  "INGENIERIA PROYECTOS & CONSULTING LANZA S.L.",
  "COTTÉS Fire & Smoke Solutions, S.L.",
];

const FALSE_POS = new Set([4448, 3155, 1254]);

async function main() {
  const empresas = await p.empresa.findMany({ select: { id: true, nombre: true } });
  console.log(`Total empresas: ${empresas.length}`);

  // First, reset all cepreven to null
  await p.$executeRaw`UPDATE "Empresa" SET cepreven = NULL WHERE cepreven IS NOT NULL`;
  console.log("Reset all cepreven to NULL");

  // Match asociadas
  const asoc = matchMembers(ASOCIADAS, empresas, FALSE_POS);
  console.log(`\nASOCIADAS: ${asoc.matched.length} matched, ${asoc.unmatched.length} unmatched`);

  // Match calificadas
  const calif = matchMembers(CALIFICADAS, empresas, FALSE_POS);
  console.log(`CALIFICADAS: ${calif.matched.length} matched, ${calif.unmatched.length} unmatched`);
  if (calif.unmatched.length > 0) {
    console.log("  Unmatched calificadas:", calif.unmatched);
  }

  // Apply: calificada takes priority over asociada
  const calificadaIds = new Set(calif.matched.map(m => m.id));
  const asociadaIds = asoc.matched.map(m => m.id).filter(id => !calificadaIds.has(id));

  // Update asociadas
  if (asociadaIds.length > 0) {
    const result = await p.empresa.updateMany({
      where: { id: { in: asociadaIds } },
      data: { cepreven: "asociada" },
    });
    console.log(`\n✅ Marcadas como 'asociada': ${result.count}`);
  }

  // Update calificadas
  if (calificadaIds.size > 0) {
    const result = await p.empresa.updateMany({
      where: { id: { in: [...calificadaIds] } },
      data: { cepreven: "calificada" },
    });
    console.log(`✅ Marcadas como 'calificada': ${result.count}`);
  }

  // Verify
  const countAsoc = await p.empresa.count({ where: { cepreven: "asociada" } });
  const countCalif = await p.empresa.count({ where: { cepreven: "calificada" } });
  console.log(`\nResultado final: ${countAsoc} asociadas + ${countCalif} calificadas = ${countAsoc + countCalif} total`);

  await p.$disconnect();
}

main();
