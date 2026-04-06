import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const updates: { cif: string; direccion: string; localidad: string; codigoPostal: string; provincia: string }[] = [
  // Grupo 1 (empresas 1-7 de la lista)
  { cif: "B06977664", direccion: "Calle les colomeres, 25 - p. bj pta. 3", localidad: "Gavà", codigoPostal: "08850", provincia: "Barcelona" },
  { cif: "B55309108", direccion: "Calle del doctor marti casals, 34", localidad: "Santa Cristina d'Aro", codigoPostal: "17246", provincia: "Gerona" },
  { cif: "B25552720", direccion: "Avenida catalunya, 9", localidad: "Mollerussa", codigoPostal: "25230", provincia: "Lérida" },
  { cif: "B55226633", direccion: "Calle maçana, 74 - bj", localidad: "Girona", codigoPostal: "17006", provincia: "Gerona" },
  { cif: "B35230127", direccion: "Calle bilbao, s/n", localidad: "Arrecife", codigoPostal: "35500", provincia: "Las Palmas" },
  { cif: "E17564584", direccion: "Bajada ca l'aldran, 4 - bj", localidad: "Puigcerdà", codigoPostal: "17520", provincia: "Gerona" },
  { cif: "B67438101", direccion: "Ronda dels paisos catalans, 34 - pta 1", localidad: "Mataró", codigoPostal: "08304", provincia: "Barcelona" },
  // Grupo 2 (empresas 8-45 de la lista)
  { cif: "B65794174", direccion: "Calle covadonga, 369 - 1 3", localidad: "Sabadell", codigoPostal: "08203", provincia: "Barcelona" },
  { cif: "B55331359", direccion: "Calle industria, 24 - nav 4", localidad: "Palafrugell", codigoPostal: "17200", provincia: "Gerona" },
  { cif: "B25677634", direccion: "Calle llorenç agusti claveria, 105", localidad: "Lleida", codigoPostal: "25190", provincia: "Lérida" },
  { cif: "J63161327", direccion: "Calle joaquim folguera, 62 - in", localidad: "Gavà", codigoPostal: "08850", provincia: "Barcelona" },
  { cif: "B76653302", direccion: "Calle transversal doce izquierda las gavias, oficina b", localidad: "San Cristóbal de La Laguna", codigoPostal: "38206", provincia: "Santa Cruz de Tenerife" },
  // A58411471 GON-BAR: n.a. — skip
  { cif: "B61100152", direccion: "Avenida josep tarradellas i joan, 253-257 local 4", localidad: "L'Hospitalet de Llobregat", codigoPostal: "08901", provincia: "Barcelona" },
  // N0251838I I.M.E. ANTINCENDIO: n.a. — skip
  { cif: "B82115627", direccion: "Calle peñalara, 17", localidad: "Meco", codigoPostal: "28880", provincia: "Madrid" },
  { cif: "B38470456", direccion: "Carretera enlace doctor morera bravo (el pueblo), 3 - ptl a bj 1", localidad: "Villa de Mazo", codigoPostal: "38730", provincia: "Santa Cruz de Tenerife" },
  { cif: "B66901331", direccion: "Ronda del montseny, 34", localidad: "Dosrius", codigoPostal: "08319", provincia: "Barcelona" },
  { cif: "B02966539", direccion: "Calle merce rodoreda i gurgui, 22", localidad: "Argentona", codigoPostal: "08310", provincia: "Barcelona" },
  { cif: "B65950339", direccion: "Calle sao paulo, 18 - bl b esc 3 piso 5 pta 4", localidad: "Barcelona", codigoPostal: "08030", provincia: "Barcelona" },
  { cif: "B87296711", direccion: "Calle oviedo, 26", localidad: "Arganda del Rey", codigoPostal: "28500", provincia: "Madrid" },
  { cif: "B21822325", direccion: "Calle lleida, 43 - bl a", localidad: "Gironella", codigoPostal: "08680", provincia: "Barcelona" },
  { cif: "B75373845", direccion: "Calle mossen josep pons, 1 - p. 1 pta. 4", localidad: "Terrassa", codigoPostal: "08228", provincia: "Barcelona" },
  { cif: "B04970091", direccion: "Ronda Joan Maragall, 33", localidad: "Puigcerdà", codigoPostal: "17520", provincia: "Gerona" },
  { cif: "B55643712", direccion: "Camino del lliri, 72", localidad: "Tortosa", codigoPostal: "43500", provincia: "Tarragona" },
  { cif: "B67912071", direccion: "Rambla generalitat, 60 - loc d", localidad: "Vilafranca del Penedès", codigoPostal: "08720", provincia: "Barcelona" },
  { cif: "B55320444", direccion: "Calle gavines, 26 - loc 1 c", localidad: "Castell d'Aro, Platja d'Aro, S'Agaró", codigoPostal: "17249", provincia: "Gerona" },
  { cif: "B17630161", direccion: "Calle josep carbo i vidal, 3", localidad: "Palamós", codigoPostal: "17230", provincia: "Gerona" },
  { cif: "B56993256", direccion: "Calle de colom, 495 - bis, 2", localidad: "Terrassa", codigoPostal: "08228", provincia: "Barcelona" },
  { cif: "B63516637", direccion: "Calle catalunya, 12", localidad: "Granollers", codigoPostal: "08401", provincia: "Barcelona" },
  { cif: "J62210158", direccion: "Calle pla de baix, 28 - 1 1", localidad: "Granollers", codigoPostal: "08402", provincia: "Barcelona" },
  { cif: "B61038253", direccion: "Rambla nova, 16", localidad: "Igualada", codigoPostal: "08700", provincia: "Barcelona" },
  { cif: "B16877086", direccion: "Calle hortensia, 13", localidad: "Llagostera", codigoPostal: "17240", provincia: "Gerona" },
  { cif: "B17785395", direccion: "Avenida puig negre, 2", localidad: "Forallac", codigoPostal: "17111", provincia: "Gerona" },
  { cif: "B17403536", direccion: "Carretera comarcal 255, palamos km 40 nau 39", localidad: "Vall-llobrega", codigoPostal: "17253", provincia: "Gerona" },
  { cif: "B63200042", direccion: "Avenida puig i cadafalch, 209", localidad: "Mataró", codigoPostal: "08303", provincia: "Barcelona" },
  { cif: "B56930431", direccion: "Calle estacio, 5", localidad: "Palafrugell", codigoPostal: "17200", provincia: "Gerona" },
  { cif: "B19916832", direccion: "Calle de la innovacion, 7", localidad: "Getafe", codigoPostal: "28906", provincia: "Madrid" },
  { cif: "B67318311", direccion: "Calle mas pujol, 36", localidad: "Les Franqueses del Vallès", codigoPostal: "08520", provincia: "Barcelona" },
  { cif: "G61577649", direccion: "Carrer de la Gran Bretanya, 16", localidad: "Igualada", codigoPostal: "08700", provincia: "Barcelona" },
  { cif: "G59692657", direccion: "Calle la munia, 70", localidad: "Vilafranca del Penedès", codigoPostal: "08720", provincia: "Barcelona" },
  { cif: "B67777292", direccion: "Calle trens petits, 8", localidad: "Girona", codigoPostal: "17005", provincia: "Gerona" },
  { cif: "J62639430", direccion: "Calle roser dolcet, 3 - 1", localidad: "Vilanova i la Geltrú", codigoPostal: "08800", provincia: "Barcelona" },
  { cif: "B66822024", direccion: "Calle sant sebastia, 51 - p. 2 pta. 5", localidad: "Sabadell", codigoPostal: "08203", provincia: "Barcelona" },
  { cif: "N0087447I", direccion: "Calle beethoven, 15 - 5", localidad: "Barcelona", codigoPostal: "08021", provincia: "Barcelona" },
];

async function main() {
  console.log(`Actualizando ${updates.length} empresas...\n`);
  let ok = 0, notFound = 0;

  for (const u of updates) {
    const empresa = await prisma.empresa.findFirst({ where: { cif: u.cif } });
    if (!empresa) {
      console.log(`❌ CIF ${u.cif} no encontrado en BD`);
      notFound++;
      continue;
    }

    await prisma.empresa.update({
      where: { id: empresa.id },
      data: {
        direccion: u.direccion,
        localidad: u.localidad,
        codigoPostal: u.codigoPostal,
        provincia: u.provincia,
      },
    });
    ok++;
    console.log(`✅ ${u.cif} ${empresa.nombre} → ${u.localidad}, ${u.provincia}`);
  }

  console.log(`\nActualizadas: ${ok} | No encontradas: ${notFound}`);
  console.log(`Sin datos (n.a.): GON-BAR (A58411471), I.M.E. ANTINCENDIO (N0251838I)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
