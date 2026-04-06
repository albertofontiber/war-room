import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed War Room PCI...");

  // ─── GRUPOS ──────────────────────────────────────────────────────────────
  const grupoJC = await prisma.grupo.upsert({
    where: { id: 1 },
    update: {},
    create: {
      nombre: "Johnson Controls",
      tipo: "multinacional",
      paisOrigen: "US",
      notas: "Multinacional líder en PCI y building technologies. Cotiza NYSE: JCI.",
    },
  });

  const grupoChubb = await prisma.grupo.upsert({
    where: { id: 2 },
    update: {},
    create: {
      nombre: "Chubb / Carrier Global",
      tipo: "multinacional",
      paisOrigen: "US",
      notas: "Carrier Global adquirió Chubb Fire & Security en 2021. División Fire & Security.",
    },
  });

  const grupoSecuritas = await prisma.grupo.upsert({
    where: { id: 3 },
    update: {},
    create: {
      nombre: "Securitas",
      tipo: "multinacional",
      paisOrigen: "SE",
      notas: "Securitas AB, Estocolmo. División Electronic Security en España.",
    },
  });

  const grupoEurofeu = await prisma.grupo.upsert({
    where: { id: 4 },
    update: {},
    create: {
      nombre: "Eurofeu",
      tipo: "PE",
      paisOrigen: "FR",
      notas: "Grupo francés de PCI, respaldado por fondos de PE. Expansión activa en Iberia.",
    },
  });

  // ─── EMPRESAS ─────────────────────────────────────────────────────────────
  // web: URL real solo para grupos grandes (Excel); null para el resto.
  // empleados: coherente con tamaño de empresa.

  // 1 — EUSKADI · Bilbao · PCI puro · prospecto
  const e1 = await prisma.empresa.upsert({
    where: { cif: "B48123456" },
    update: {},
    create: {
      cif: "B48123456",
      nombre: "Ignis Protección S.L.",
      direccion: "Calle Alameda Mazarredo 47, 3º",
      localidad: "Bilbao",
      provincia: "Vizcaya",
      ccaa: "Euskadi",
      lat: 43.2630,
      lng: -2.9350,
      sector: "PCI",
      servicios: JSON.stringify(["instalacion", "mantenimiento", "ingenieria"]),
      empleados: 62,
      web: null,
      descripcion: "Empresa vasca de referencia en protección contra incendios industrial. Especialistas en sistemas de detección y extinción para el sector siderúrgico y químico.",
      cepreven: "asociada",
      aerme: false,
      enPerimetro: true,
      scoreInicial: 74,
      score: 74,
    },
  });

  // 2 — EUSKADI · Derio · Seguridad electrónica · prospecto
  const e2 = await prisma.empresa.upsert({
    where: { cif: "B48234567" },
    update: {},
    create: {
      cif: "B48234567",
      nombre: "Segur Euskadi S.L.",
      direccion: "Parque Tecnológico de Bizkaia, Edificio 104, Derio",
      localidad: "Derio",
      provincia: "Vizcaya",
      ccaa: "Euskadi",
      lat: 43.2840,
      lng: -2.8680,
      sector: "seguridad_electronica",
      servicios: JSON.stringify(["instalacion", "mantenimiento"]),
      empleados: 28,
      web: null,
      descripcion: "Integradora de sistemas de videovigilancia, control de accesos y gestión de alarmas para el sector industrial y logístico en el País Vasco.",
      cepreven: null,
      aerme: false,
      enPerimetro: true,
      scoreInicial: 55,
      score: 55,
    },
  });

  // 3 — EUSKADI · Donostia · Mixto · NBO
  const e3 = await prisma.empresa.upsert({
    where: { cif: "A20345678" },
    update: {},
    create: {
      cif: "A20345678",
      nombre: "Protectio Norte S.A.",
      direccion: "Polígono Industrial Zuatzu, Edificio Igeldo",
      localidad: "San Sebastián",
      provincia: "Guipúzcoa",
      ccaa: "Euskadi",
      lat: 43.3210,
      lng: -1.9830,
      sector: "mixto",
      servicios: JSON.stringify(["instalacion", "mantenimiento", "ingenieria", "seg_electronica"]),
      empleados: 95,
      web: null,
      descripcion: "Empresa mixta con amplia experiencia en PCI y seguridad electrónica en Guipúzcoa y Navarra. En proceso de reestructuración tras cambio generacional.",
      cepreven: "asociada",
      aerme: false,
      enPerimetro: true,
      scoreInicial: 68,
      score: 68,
    },
  });

  // 4 — MADRID · PCI puro · Johnson Controls · contactado
  const e4 = await prisma.empresa.upsert({
    where: { cif: "A28456789" },
    update: {},
    create: {
      cif: "A28456789",
      nombre: "Johnson Controls Iberia S.A.",
      direccion: "Calle Josefa Valcárcel 40",
      localidad: "Madrid",
      provincia: "Madrid",
      ccaa: "Comunidad de Madrid",
      lat: 40.4530,
      lng: -3.6730,
      sector: "PCI",
      servicios: JSON.stringify(["instalacion", "mantenimiento", "ingenieria"]),
      grupoId: grupoJC.id,
      empleados: 420,
      web: "https://www.johnsoncontrols.com/es-es",  // fuente: Excel
      logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Johnson_Controls_logo.svg/320px-Johnson_Controls_logo.svg.png",
      descripcion: "Filial española de Johnson Controls, líder mundial en tecnologías de edificios inteligentes, eficiencia energética y soluciones de PCI para grandes infraestructuras.",
      cepreven: "asociada",
      aerme: false,
      enPerimetro: true,
      scoreInicial: 45,
      score: 45,
    },
  });

  // 5 — MADRID · Mixto · independiente · contactado
  const e5 = await prisma.empresa.upsert({
    where: { cif: "B28567890" },
    update: {},
    create: {
      cif: "B28567890",
      nombre: "MadridSec Integración S.L.",
      direccion: "Calle Arturo Soria 245",
      localidad: "Madrid",
      provincia: "Madrid",
      ccaa: "Comunidad de Madrid",
      lat: 40.4370,
      lng: -3.6580,
      sector: "mixto",
      servicios: JSON.stringify(["instalacion", "mantenimiento", "seg_electronica"]),
      empleados: 112,
      web: null,
      descripcion: "Integradora madrileña con presencia en hospitales, centros comerciales y oficinas corporativas. Fuerte posición en mantenimiento recurrente.",
      cepreven: null,
      aerme: false,
      enPerimetro: true,
      scoreInicial: 71,
      score: 71,
    },
  });

  // 6 — MADRID · Seguridad electrónica · Securitas · contactado
  const e6 = await prisma.empresa.upsert({
    where: { cif: "A28678901" },
    update: {},
    create: {
      cif: "A28678901",
      nombre: "Securitas Sistemas S.A.",
      direccion: "Calle Sepúlveda 6",
      localidad: "Alcobendas",
      provincia: "Madrid",
      ccaa: "Comunidad de Madrid",
      lat: 40.5340,
      lng: -3.6390,
      sector: "seguridad_electronica",
      servicios: JSON.stringify(["instalacion", "mantenimiento", "seg_electronica"]),
      grupoId: grupoSecuritas.id,
      empleados: 310,
      web: "https://www.securitas.es",  // fuente: Excel
      logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Securitas_logo.svg/320px-Securitas_logo.svg.png",
      descripcion: "División de sistemas electrónicos de seguridad de Securitas en España. Líder en monitorización centralizada y gestión de alarmas para grandes cuentas.",
      cepreven: null,
      aerme: false,
      enPerimetro: true,
      scoreInicial: 42,
      score: 42,
    },
  });

  // 7 — CATALUÑA · Barcelona · PCI puro · Chubb · exclusividad
  const e7 = await prisma.empresa.upsert({
    where: { cif: "A08789012" },
    update: {},
    create: {
      cif: "A08789012",
      nombre: "Chubb Fire & Security España S.L.",
      direccion: "Avinguda Diagonal 211-213",
      localidad: "Barcelona",
      provincia: "Barcelona",
      ccaa: "Cataluña",
      lat: 41.3850,
      lng: 2.1730,
      sector: "PCI",
      servicios: JSON.stringify(["instalacion", "mantenimiento", "ingenieria"]),
      grupoId: grupoChubb.id,
      empleados: 335,
      web: "https://www.chubb.com/es-es",  // fuente: Excel
      logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Chubb_logo.svg/320px-Chubb_logo.svg.png",
      descripcion: "División española de Chubb Fire & Security (Carrier Global). Soluciones integrales de detección y extinción para sector terciario, industrial y transporte.",
      cepreven: "asociada",
      aerme: false,
      enPerimetro: true,
      scoreInicial: 51,
      score: 51,
    },
  });

  // 8 — CATALUÑA · Barcelona · Mixto · NBO
  const e8 = await prisma.empresa.upsert({
    where: { cif: "B08890123" },
    update: {},
    create: {
      cif: "B08890123",
      nombre: "Catalunya Fire Systems S.L.",
      direccion: "Carrer de la Llacuna 162, 22@ Barcelona",
      localidad: "Barcelona",
      provincia: "Barcelona",
      ccaa: "Cataluña",
      lat: 41.4010,
      lng: 2.1940,
      sector: "mixto",
      servicios: JSON.stringify(["instalacion", "mantenimiento", "ingenieria", "seg_electronica"]),
      empleados: 138,
      web: null,
      descripcion: "Empresa familiar fundada en 1987. Especialistas en sistemas de extinción por agua nebulizada y gases para sector hotelero y patrimonio histórico.",
      cepreven: "asociada",
      aerme: false,
      enPerimetro: true,
      scoreInicial: 80,
      score: 80,
    },
  });

  // 9 — ANDALUCÍA · Sevilla · PCI puro · portfolio
  const e9 = await prisma.empresa.upsert({
    where: { cif: "A41901234" },
    update: {},
    create: {
      cif: "A41901234",
      nombre: "Andalufuego S.A.",
      direccion: "Calle Betis 24",
      localidad: "Sevilla",
      provincia: "Sevilla",
      ccaa: "Andalucía",
      lat: 37.3880,
      lng: -5.9820,
      sector: "PCI",
      servicios: JSON.stringify(["instalacion", "mantenimiento", "ingenieria"]),
      empleados: 175,
      web: null,
      descripcion: "Líder regional en Andalucía con contratos de mantenimiento en aeropuertos, puertos y grandes infraestructuras logísticas. Accionariado familiar de tercera generación.",
      cepreven: "asociada",
      aerme: false,
      enPerimetro: true,
      scoreInicial: 85,
      score: 85,
    },
  });

  // 10 — ANDALUCÍA · Málaga · Seguridad electrónica · prospecto
  const e10 = await prisma.empresa.upsert({
    where: { cif: "B29012345" },
    update: {},
    create: {
      cif: "B29012345",
      nombre: "Costa Sol Seguridad S.L.",
      direccion: "Avenida de la Aurora 47, Parque Tecnológico de Andalucía",
      localidad: "Málaga",
      provincia: "Málaga",
      ccaa: "Andalucía",
      lat: 36.7200,
      lng: -4.4200,
      sector: "seguridad_electronica",
      servicios: JSON.stringify(["instalacion", "mantenimiento", "seg_electronica"]),
      empleados: 45,
      web: null,
      descripcion: "Integradora de seguridad electrónica para el sector turístico y residencial de la Costa del Sol. Cartera de +1.200 contratos de mantenimiento.",
      cepreven: null,
      aerme: false,
      enPerimetro: true,
      scoreInicial: 58,
      score: 58,
    },
  });

  // 11 — CASTILLA Y LEÓN · Burgos · PCI · Eurofeu · muerto · fuera perímetro
  const e11 = await prisma.empresa.upsert({
    where: { cif: "B09123456" },
    update: {},
    create: {
      cif: "B09123456",
      nombre: "Eurofeu Castilla S.L.",
      direccion: "Polígono Industrial Villalonquéjar, Calle A nº 12",
      localidad: "Burgos",
      provincia: "Burgos",
      ccaa: "Castilla y León",
      lat: 42.3440,
      lng: -3.6960,
      sector: "PCI",
      servicios: JSON.stringify(["instalacion", "mantenimiento"]),
      grupoId: grupoEurofeu.id,
      empleados: 70,
      web: "https://www.eurofeu.es",  // fuente: Excel
      descripcion: "Subsidiaria de Eurofeu en Castilla y León. Adquirida en 2019. Integrada operativamente en la red nacional del grupo.",
      cepreven: "asociada",
      aerme: false,
      enPerimetro: false,
      enPerimetroAt: new Date("2024-06-15"),
      scoreInicial: 32,
      score: 32,
    },
  });

  // 12 — CASTILLA Y LEÓN · Valladolid · Mixto · muerto · fuera perímetro
  const e12 = await prisma.empresa.upsert({
    where: { cif: "B47234567" },
    update: {},
    create: {
      cif: "B47234567",
      nombre: "Vallsec Control S.L.",
      direccion: "Calle Gamazo 15, 2ª planta",
      localidad: "Valladolid",
      provincia: "Valladolid",
      ccaa: "Castilla y León",
      lat: 41.6520,
      lng: -4.7240,
      sector: "mixto",
      servicios: JSON.stringify(["instalacion", "mantenimiento", "seg_electronica"]),
      empleados: 38,
      web: null,
      descripcion: "Empresa local con declive de ingresos los últimos tres años. Proceso de liquidación parcial de activos en curso.",
      cepreven: null,
      aerme: false,
      enPerimetro: false,
      enPerimetroAt: new Date("2024-09-01"),
      scoreInicial: 28,
      score: 28,
    },
  });

  // 13 — ARAGÓN · Zaragoza · PCI · sin CRM · fuera perímetro
  const e13 = await prisma.empresa.upsert({
    where: { cif: "B50345678" },
    update: {},
    create: {
      cif: "B50345678",
      nombre: "Aragón PCI Técnica S.L.",
      direccion: "Polígono ACTUR, Calle Rio Aguasvivas 4",
      localidad: "Zaragoza",
      provincia: "Zaragoza",
      ccaa: "Aragón",
      lat: 41.6560,
      lng: -0.8780,
      sector: "PCI",
      servicios: JSON.stringify(["instalacion", "mantenimiento"]),
      empleados: 22,
      web: null,
      cepreven: null,
      aerme: false,
      enPerimetro: false,
      enPerimetroAt: new Date("2025-01-10"),
      scoreInicial: 40,
      score: 40,
    },
  });

  // 14 — ASTURIAS · Llanera · Seguridad electrónica · sin CRM · fuera perímetro
  const e14 = await prisma.empresa.upsert({
    where: { cif: "B33456789" },
    update: {},
    create: {
      cif: "B33456789",
      nombre: "Astur Electroprotect S.L.",
      direccion: "Avenida de Galicia 31, Parque Empresarial Asipo",
      localidad: "Llanera",
      provincia: "Asturias",
      ccaa: "Principado de Asturias",
      lat: 43.3620,
      lng: -5.8490,
      sector: "seguridad_electronica",
      servicios: JSON.stringify(["instalacion", "mantenimiento", "seg_electronica"]),
      empleados: 18,
      web: null,
      cepreven: null,
      aerme: false,
      enPerimetro: false,
      enPerimetroAt: new Date("2025-02-20"),
      scoreInicial: 35,
      score: 35,
    },
  });

  // 15 — GALICIA · A Coruña · PCI · sin CRM · fuera perímetro
  const e15 = await prisma.empresa.upsert({
    where: { cif: "B15567890" },
    update: {},
    create: {
      cif: "B15567890",
      nombre: "Noroeste PCI S.L.",
      direccion: "Polígono Industrial A Grela, Rúa Alcalde Lens 12",
      localidad: "A Coruña",
      provincia: "A Coruña",
      ccaa: "Galicia",
      lat: 43.3700,
      lng: -8.3960,
      sector: "PCI",
      servicios: JSON.stringify(["instalacion", "mantenimiento", "ingenieria"]),
      empleados: 55,
      web: null,
      cepreven: "asociada",
      aerme: false,
      enPerimetro: false,
      enPerimetroAt: new Date("2025-03-05"),
      scoreInicial: 48,
      score: 48,
    },
  });

  console.log("✅ Empresas creadas (15)");

  // ─── FINANCIEROS — valores absolutos € ───────────────────────────────────
  // margenBruto y ebitda son importes €, no porcentajes.
  // margenBrutoPct y ebitdaPct se calculan en el API route.
  // Tendencias decrecientes en: e3 (Protectio), e10 (Costa Sol), e12 (Vallsec)
  const financierosData = [
    // E1 Ignis — CRECIENTE (~41% MB, ~14% EBITDA)
    { empresaId: e1.id, anio: 2021, ingresos: 6_800_000, margenBruto: 2_584_000, ebitda: 816_000, resultadoNeto: 480_000 },
    { empresaId: e1.id, anio: 2022, ingresos: 7_400_000, margenBruto: 2_886_000, ebitda: 962_000, resultadoNeto: 570_000 },
    { empresaId: e1.id, anio: 2023, ingresos: 8_200_000, margenBruto: 3_362_000, ebitda: 1_148_000, resultadoNeto: 680_000 },
    // E2 Segur Euskadi — CRECIENTE (~35% MB, ~10% EBITDA)
    { empresaId: e2.id, anio: 2021, ingresos: 3_200_000, margenBruto: 1_088_000, ebitda: 288_000, resultadoNeto: 180_000 },
    { empresaId: e2.id, anio: 2022, ingresos: 3_600_000, margenBruto: 1_260_000, ebitda: 360_000, resultadoNeto: 220_000 },
    { empresaId: e2.id, anio: 2023, ingresos: 4_100_000, margenBruto: 1_476_000, ebitda: 451_000, resultadoNeto: 270_000 },
    // E3 Protectio Norte — DECRECIENTE (~39% MB, ~13% EBITDA, deterioro)
    { empresaId: e3.id, anio: 2021, ingresos: 14_200_000, margenBruto: 5_822_000, ebitda: 2_130_000, resultadoNeto: 1_100_000 },
    { empresaId: e3.id, anio: 2022, ingresos: 13_100_000, margenBruto: 5_109_000, ebitda: 1_703_000, resultadoNeto: 820_000 },
    { empresaId: e3.id, anio: 2023, ingresos: 11_800_000, margenBruto: 4_484_000, ebitda: 1_416_000, resultadoNeto: 590_000 },
    // E4 JC Iberia — CRECIENTE (~43% MB, ~18% EBITDA)
    { empresaId: e4.id, anio: 2021, ingresos: 47_000_000, margenBruto: 19_270_000, ebitda: 7_520_000, resultadoNeto: 4_800_000 },
    { empresaId: e4.id, anio: 2022, ingresos: 51_000_000, margenBruto: 21_420_000, ebitda: 8_670_000, resultadoNeto: 5_500_000 },
    { empresaId: e4.id, anio: 2023, ingresos: 55_000_000, margenBruto: 23_650_000, ebitda: 9_900_000, resultadoNeto: 6_300_000 },
    // E5 MadridSec — PLANA (~39% MB, ~13% EBITDA)
    { empresaId: e5.id, anio: 2021, ingresos: 14_200_000, margenBruto: 5_396_000, ebitda: 1_704_000, resultadoNeto: 1_050_000 },
    { empresaId: e5.id, anio: 2022, ingresos: 14_800_000, margenBruto: 5_772_000, ebitda: 1_924_000, resultadoNeto: 1_120_000 },
    { empresaId: e5.id, anio: 2023, ingresos: 15_100_000, margenBruto: 5_889_000, ebitda: 1_963_000, resultadoNeto: 1_150_000 },
    // E6 Securitas Sistemas — CRECIENTE (~43% MB, ~16% EBITDA)
    { empresaId: e6.id, anio: 2021, ingresos: 33_000_000, margenBruto: 13_860_000, ebitda: 4_950_000, resultadoNeto: 3_100_000 },
    { empresaId: e6.id, anio: 2022, ingresos: 35_000_000, margenBruto: 15_050_000, ebitda: 5_600_000, resultadoNeto: 3_500_000 },
    { empresaId: e6.id, anio: 2023, ingresos: 38_000_000, margenBruto: 16_720_000, ebitda: 6_460_000, resultadoNeto: 4_100_000 },
    // E7 Chubb — CRECIENTE (~45% MB, ~18% EBITDA)
    { empresaId: e7.id, anio: 2021, ingresos: 36_000_000, margenBruto: 15_840_000, ebitda: 6_120_000, resultadoNeto: 3_800_000 },
    { empresaId: e7.id, anio: 2022, ingresos: 39_000_000, margenBruto: 17_550_000, ebitda: 7_020_000, resultadoNeto: 4_300_000 },
    { empresaId: e7.id, anio: 2023, ingresos: 42_000_000, margenBruto: 19_320_000, ebitda: 7_980_000, resultadoNeto: 4_900_000 },
    // E8 Catalunya Fire — CRECIENTE (~40% MB, ~14% EBITDA)
    { empresaId: e8.id, anio: 2021, ingresos: 14_000_000, margenBruto: 5_320_000, ebitda: 1_820_000, resultadoNeto: 1_050_000 },
    { empresaId: e8.id, anio: 2022, ingresos: 16_000_000, margenBruto: 6_240_000, ebitda: 2_240_000, resultadoNeto: 1_280_000 },
    { empresaId: e8.id, anio: 2023, ingresos: 18_000_000, margenBruto: 7_200_000, ebitda: 2_700_000, resultadoNeto: 1_540_000 },
    // E9 Andalufuego — CRECIENTE (~41% MB, ~15% EBITDA)
    { empresaId: e9.id, anio: 2021, ingresos: 18_000_000, margenBruto: 7_200_000, ebitda: 2_520_000, resultadoNeto: 1_600_000 },
    { empresaId: e9.id, anio: 2022, ingresos: 20_000_000, margenBruto: 8_200_000, ebitda: 3_000_000, resultadoNeto: 1_900_000 },
    { empresaId: e9.id, anio: 2023, ingresos: 22_000_000, margenBruto: 9_240_000, ebitda: 3_520_000, resultadoNeto: 2_200_000 },
    // E10 Costa Sol — DECRECIENTE (~35% MB, ~10% EBITDA, deterioro)
    { empresaId: e10.id, anio: 2021, ingresos: 7_200_000, margenBruto: 2_664_000, ebitda: 864_000, resultadoNeto: 550_000 },
    { empresaId: e10.id, anio: 2022, ingresos: 6_800_000, margenBruto: 2_380_000, ebitda: 680_000, resultadoNeto: 380_000 },
    { empresaId: e10.id, anio: 2023, ingresos: 6_100_000, margenBruto: 2_074_000, ebitda: 549_000, resultadoNeto: 240_000 },
    // E11 Eurofeu Castilla — CRECIENTE (~37% MB, ~11% EBITDA)
    { empresaId: e11.id, anio: 2021, ingresos: 7_500_000, margenBruto: 2_625_000, ebitda: 825_000, resultadoNeto: 490_000 },
    { empresaId: e11.id, anio: 2022, ingresos: 8_200_000, margenBruto: 2_952_000, ebitda: 902_000, resultadoNeto: 590_000 },
    { empresaId: e11.id, anio: 2023, ingresos: 9_000_000, margenBruto: 3_330_000, ebitda: 990_000, resultadoNeto: 660_000 },
    // E12 Vallsec — DECRECIENTE (~33% MB, ~8% EBITDA, deterioro)
    { empresaId: e12.id, anio: 2021, ingresos: 6_100_000, margenBruto: 2_135_000, ebitda: 610_000, resultadoNeto: 380_000 },
    { empresaId: e12.id, anio: 2022, ingresos: 5_500_000, margenBruto: 1_815_000, ebitda: 440_000, resultadoNeto: 200_000 },
    { empresaId: e12.id, anio: 2023, ingresos: 4_900_000, margenBruto: 1_519_000, ebitda: 343_000, resultadoNeto: 120_000 },
    // E13 Aragón PCI — CRECIENTE (~32% MB, ~8% EBITDA)
    { empresaId: e13.id, anio: 2021, ingresos: 2_300_000, margenBruto: 713_000, ebitda: 184_000, resultadoNeto: 100_000 },
    { empresaId: e13.id, anio: 2022, ingresos: 2_600_000, margenBruto: 832_000, ebitda: 208_000, resultadoNeto: 120_000 },
    { empresaId: e13.id, anio: 2023, ingresos: 3_000_000, margenBruto: 990_000, ebitda: 240_000, resultadoNeto: 150_000 },
    // E14 Astur Electro — PLANA (~30% MB, ~6% EBITDA)
    { empresaId: e14.id, anio: 2021, ingresos: 2_200_000, margenBruto: 638_000, ebitda: 110_000, resultadoNeto: 70_000 },
    { empresaId: e14.id, anio: 2022, ingresos: 2_300_000, margenBruto: 690_000, ebitda: 138_000, resultadoNeto: 90_000 },
    { empresaId: e14.id, anio: 2023, ingresos: 2_500_000, margenBruto: 750_000, ebitda: 150_000, resultadoNeto: 100_000 },
    // E15 Noroeste PCI — CRECIENTE (~37% MB, ~12% EBITDA)
    { empresaId: e15.id, anio: 2021, ingresos: 5_800_000, margenBruto: 2_088_000, ebitda: 696_000, resultadoNeto: 400_000 },
    { empresaId: e15.id, anio: 2022, ingresos: 6_400_000, margenBruto: 2_368_000, ebitda: 768_000, resultadoNeto: 460_000 },
    { empresaId: e15.id, anio: 2023, ingresos: 7_100_000, margenBruto: 2_627_000, ebitda: 852_000, resultadoNeto: 540_000 },
  ];

  for (const f of financierosData) {
    await prisma.financiero.upsert({
      where: { empresaId_anio: { empresaId: f.empresaId, anio: f.anio } },
      update: {},
      create: { ...f, fuente: "excel_seed", updatedAt: new Date() },
    });
  }
  console.log("✅ Financieros creados (45 registros — valores absolutos €)");

  // ─── BORME ALERTAS (4) ────────────────────────────────────────────────────
  await prisma.bormeAlerta.createMany({
    skipDuplicates: true,
    data: [
      {
        empresaId: e3.id,
        fecha: new Date("2025-07-18"),
        tipoActo: "adquisicion",
        descripcion: "Comunicación de adquisición de participaciones mayoritarias por parte de fondo de capital privado extranjero.",
        urlBorme: "https://www.boe.es/borme/dias/2025/07/18/",
        leido: false,
      },
      {
        empresaId: e8.id,
        fecha: new Date("2024-12-05"),
        tipoActo: "cambio_titular",
        descripcion: "Cambio de titularidad registral. Transmisión del 60% de participaciones entre socios familiares.",
        urlBorme: "https://www.boe.es/borme/dias/2024/12/05/",
        leido: false,
      },
      {
        empresaId: e12.id,
        fecha: new Date("2025-11-22"),
        tipoActo: "fusion",
        descripcion: "Proyecto de fusión por absorción con empresa del mismo grupo. Vallsec absorbida por sociedad holding.",
        urlBorme: "https://www.boe.es/borme/dias/2025/11/22/",
        leido: false,
      },
      {
        empresaId: e14.id,
        fecha: new Date("2024-04-10"),
        tipoActo: "disolucion",
        descripcion: "Disolución voluntaria acordada en junta general extraordinaria. Inicio de liquidación.",
        urlBorme: "https://www.boe.es/borme/dias/2024/04/10/",
        leido: true,
      },
    ],
  });
  console.log("✅ BORME alertas creadas (4)");

  // ─── CRM ESTADOS ──────────────────────────────────────────────────────────
  const crmData = [
    { empresaId: e1.id, dealStage: "prospecto",    owner: "alberto", pipedriveOrgId: "ORG-1001" },
    { empresaId: e2.id, dealStage: "prospecto",    owner: "gabriel", pipedriveOrgId: "ORG-1002" },
    { empresaId: e3.id, dealStage: "NBO",          owner: "alberto", pipedriveOrgId: "ORG-1003" },
    { empresaId: e4.id, dealStage: "contactado",   owner: "gabriel", pipedriveOrgId: "ORG-1004" },
    { empresaId: e5.id, dealStage: "contactado",   owner: "alberto", pipedriveOrgId: "ORG-1005" },
    { empresaId: e6.id, dealStage: "contactado",   owner: "gabriel", pipedriveOrgId: "ORG-1006" },
    { empresaId: e7.id, dealStage: "exclusividad", owner: "alberto", pipedriveOrgId: "ORG-1007" },
    { empresaId: e8.id, dealStage: "NBO",          owner: "gabriel", pipedriveOrgId: "ORG-1008" },
    { empresaId: e9.id, dealStage: "portfolio",    owner: "alberto", pipedriveOrgId: "ORG-1009" },
    { empresaId: e10.id, dealStage: "prospecto",   owner: "gabriel", pipedriveOrgId: "ORG-1010" },
    { empresaId: e11.id, dealStage: "muerto",      owner: "alberto", pipedriveOrgId: null },
    { empresaId: e12.id, dealStage: "muerto",      owner: "gabriel", pipedriveOrgId: null },
    // e13, e14, e15 → sin CrmEstado (sin contactar)
  ];

  for (const crm of crmData) {
    await prisma.crmEstado.upsert({
      where: { empresaId: crm.empresaId },
      update: {},
      create: { ...crm, updatedAt: new Date() },
    });
  }
  console.log("✅ CRM estados creados (12; 3 empresas sin contactar)");

  // ─── ACTIVIDADES CRM ─────────────────────────────────────────────────────
  const actividadesData = [
    // E3 Protectio Norte — NBO
    { empresaId: e3.id, pipedriveId: "ACT-3001", tipo: "reunion",  texto: "Reunión con CEO y CFO para presentar LOI. Muy receptivos. Pendiente de recibir financieros auditados 2023.", autor: "alberto", fecha: new Date("2026-02-14") },
    { empresaId: e3.id, pipedriveId: "ACT-3002", tipo: "email",    texto: "Envío de NDA firmado y cuestionario de due diligence preliminar.", autor: "alberto", fecha: new Date("2026-01-28") },
    { empresaId: e3.id, pipedriveId: "ACT-3003", tipo: "llamada",  texto: "Call con el abogado de la familia. Confirman disposición a vender 100%. Timeline: cierre antes de Q4 2026.", autor: "gabriel", fecha: new Date("2026-01-15") },
    // E7 Chubb — exclusividad
    { empresaId: e7.id, pipedriveId: "ACT-7001", tipo: "reunion",  texto: "Kick-off due diligence. Equipo de Carrier presente. Revisión de contratos de mantenimiento y pipeline comercial.", autor: "alberto", fecha: new Date("2026-03-10") },
    { empresaId: e7.id, pipedriveId: "ACT-7002", tipo: "nota",     texto: "ATENCIÓN: Carrier solicitando exclusividad prolongada 30 días adicionales. Evaluar impacto en otras opciones estratégicas.", autor: "gabriel", fecha: new Date("2026-03-18") },
    { empresaId: e7.id, pipedriveId: "ACT-7003", tipo: "email",    texto: "Solicitud de documentación adicional: certificados ATEX, registros de instalación en aeropuertos.", autor: "gabriel", fecha: new Date("2026-03-05") },
    // E8 Catalunya Fire — NBO
    { empresaId: e8.id, pipedriveId: "ACT-8001", tipo: "llamada",  texto: "Primera llamada con socios. Interés en encontrar socio industrial que mantenga autonomía operativa.", autor: "alberto", fecha: new Date("2026-02-20") },
    { empresaId: e8.id, pipedriveId: "ACT-8002", tipo: "reunion",  texto: "Visita a instalaciones. Buen estado del equipo técnico. Se detecta subinversión en herramientas en los últimos 2 años.", autor: "gabriel", fecha: new Date("2026-03-01") },
    // E9 Andalufuego — portfolio
    { empresaId: e9.id, pipedriveId: "ACT-9001", tipo: "nota",     texto: "Integración completada. Reporting Q4 2025 en línea con plan de negocio. EBITDA +1pp vs presupuesto.", autor: "alberto", fecha: new Date("2026-01-20") },
    { empresaId: e9.id, pipedriveId: "ACT-9002", tipo: "reunion",  texto: "Board quarterly. Análisis de pipeline de contratos H1 2026. Foco en Aeropuerto de Sevilla (licitación mayo).", autor: "gabriel", fecha: new Date("2026-02-05") },
  ];

  for (const act of actividadesData) {
    await prisma.actividad.upsert({
      where: { pipedriveId: act.pipedriveId },
      update: {},
      create: { ...act, sincronizadoAt: new Date() },
    });
  }
  console.log("✅ Actividades CRM creadas (10)");

  console.log("\n🎯 Seed completado:");
  console.log("   Grupos:      4");
  console.log("   Empresas:    15");
  console.log("   Financieros: 45 (valores absolutos €; % calculados en API)");
  console.log("   BORME:        4 alertas");
  console.log("   CRM:         12 estados (3 sin contactar)");
  console.log("   Actividades: 10");
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
