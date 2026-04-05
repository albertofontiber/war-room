import { PrismaClient } from '@prisma/client';
require('dotenv').config({ path: '.env.local' });
const p = new PrismaClient();

const pciAMixto = ['B62359070','B60366366','B67057083','B64587876','B67624569','B25283607','40924305Z','B61491023','B62711841','B13755855','B55680953','B65887903','B55011654','B61734224','B67035253','B43702042','B67795088','B60401353','B17054669','B59810093','A08908808','B61947453','B65958647','B43670637','B43857705','B55670566','B25603424','B65622573','B65869802','B55282545','B64301054','B66203993','B62648167','B65764961','B64766991','B55212021'];

const nuevas: Array<{cif: string, nombre: string}> = [
  {cif:'B66230822',nombre:'SIP BCN, SL'},
  {cif:'B17139627',nombre:'JP SISTEMES DE SEGURETAT, SL'},
  {cif:'12236839B',nombre:'LUIS M. BENITO CASADO'},
  {cif:'J63161327',nombre:'FEROMI SISTEMAS, SCP'},
  {cif:'B85704138',nombre:'BE QUIET, SL'},
  {cif:'B43597251',nombre:'CREATRONIC, SL'},
  {cif:'A61327912',nombre:'SCOESS SISTEMAS DE SEGURIDAD, SAL'},
  {cif:'B02966539',nombre:'LAXARXA BIN, SL'},
  {cif:'B17215252',nombre:'CAMOS & FILLS, SL'},
  {cif:'B60739141',nombre:'GUAL SEGURETAT, SL (ALARMAS ZONAR)'},
  {cif:'B66085341',nombre:'ACTIVA SEGURETAT 2013, SL'},
  {cif:'77261373A',nombre:'RODRI SEGURETAT, SL'},
  {cif:'B65794174',nombre:'DELGADO GINER SEGURETAT, SL'},
  {cif:'B67912071',nombre:'SAT SEGURETAT'},
  {cif:'B65265415',nombre:'ALPHANET SECURITY SYSTEMS, SL'},
  {cif:'B67318311',nombre:'SOM CONTROL I SEGURETAT, SL'},
  {cif:'B17706441',nombre:'SEGUR BLANES, SL'},
  {cif:'B65719197',nombre:'INSTALACIONES TRUE, SL'},
  {cif:'B65689366',nombre:'SYOCAT, SL'},
  {cif:'B60336310',nombre:'SEGURIDAD VIALSE, SL'},
  {cif:'B67564872',nombre:'ALARMAS VALLES, SL'},
  {cif:'B58840984',nombre:'PARADIS BLAU, SL (NEXOTECH)'},
  {cif:'B62798517',nombre:'TELECOMUNICACIONS I ELECTRONICA SONIELEC, SL'},
  {cif:'A64263528',nombre:'CONVI SISTEMAS DE SEGURIDAD, SA'},
  {cif:'78001555E',nombre:'CARLOS DIAZ HUERTAS'},
  {cif:'B17631698',nombre:'IB2 SEGURETAT CATALUNYA, SL'},
  {cif:'B55226633',nombre:'ATC SISTEMES DE SEGURETAT, SL'},
  {cif:'40901101V',nombre:'ARTEMI SISTEMAS DE SEGURIDAD, SL'},
  {cif:'B25552720',nombre:'ARSOL SISTEMES DE PROTECCIO, SL'},
  {cif:'B63200042',nombre:'SISTEMAS PROYECTOS E INSTALACIONES DE SEGURIDAD, SL'},
  {cif:'B58623059',nombre:'AUDINOVA, SL'},
  {cif:'B63097109',nombre:'TECHNICAL GENERIC SECURITY SYSTEMS, SL'},
  {cif:'B55320444',nombre:'SEGURDARO, SL'},
  {cif:'A58411471',nombre:'GON - BAR, SA'},
  {cif:'45537808Q',nombre:'MARCOS BRAVO VERDAGUER'},
  {cif:'B65043861',nombre:'SISTEMES DE SEGURETAT J. LIMA, SL'},
  {cif:'B55591739',nombre:'SEICOR SECURITY SYSTEMS, SLU'},
  {cif:'J62210158',nombre:'SEGURETAT PONENT, SCP'},
  {cif:'B66288598',nombre:'ONA SEGURETAT, SL'},
  {cif:'B04970091',nombre:'PUIGCERDA SEGURETAT, SL'},
  {cif:'B25677634',nombre:'EME GLOBAL. PROTECCION DE INCENDIOS, SL'},
  {cif:'B61100152',nombre:'GRUPO 69 SISTEMAS INFORMATICOS, SL'},
  {cif:'B65950339',nombre:'MGM SISTEMAS AVANZADOS DE SEGURIDAD ELECTRONICA, SLU'},
  {cif:'B62822507',nombre:'GLOBALTEC SEGURIDAD, SL'},
  {cif:'B67438101',nombre:'DABYTEC SECURITY, SL'},
  {cif:'39708208L',nombre:'FRANCISCO JAVIER DEL REY LLORENS (ASTEIA SISTEMAS)'},
  {cif:'B62541255',nombre:'GRUP ADEUR SISTEMES DE SEGURETAT, SL'},
  {cif:'B66822024',nombre:'VIGILA2 SEGURETAT 2016, SL'},
  {cif:'B62594759',nombre:'SEGURETAT INDUSTRIAL DEL MARESME I GIRONA, SL'},
  {cif:'B55643712',nombre:'RODISA SEGURETAT, SL'},
  {cif:'B59896852',nombre:'SEGURIDAD EURO SYSTEMS 24, SL'},
  {cif:'B61038253',nombre:'SEGURETAT, INCENDI I MANTENIMENTS, SL'},
  {cif:'B65093049',nombre:'TECHNODOMO SOLUCIONES INTELIGENTES, SL'},
  {cif:'B61617254',nombre:'ADDA INSTALLACIONS I MUNTATGES, SL'},
  {cif:'B64433444',nombre:'TANTIK SEGURETAT, SL'},
  {cif:'B60780533',nombre:'BARS SEGUR, SL'},
  {cif:'38540672D',nombre:'SEGURBASA'},
  {cif:'B55331359',nombre:'DKJ-7 SISTEMES DE SEGURETAT, SL'},
  {cif:'B65931610',nombre:'LOOPS CLOUD COMPUTING, SL'},
  {cif:'G61577649',nombre:'TECNO - SEGURETAT ANOIA, SL'},
  {cif:'B55518724',nombre:'NEMEA SEGURETAT, SLU'},
  {cif:'B64544059',nombre:'INSTALLACIONS DE SISTEMES APLICATS, SL'},
  {cif:'B67777292',nombre:'TOT SEGURETAT GIRONA, SL'},
  {cif:'52423979X',nombre:'JOSE MIGUEL MORALES MARTINGRANDE'},
  {cif:'B16877086',nombre:'SEGURICAT, SL'},
  {cif:'B17993163',nombre:'IN OUT SEGURETAT, SL'},
  {cif:'E17564584',nombre:'CERDANYA SEGURETAT, CB'},
  {cif:'B65991598',nombre:'NAS 3000 INTESETE, SL'},
  {cif:'J17673385',nombre:'ACTIVA SEGURETAT, SCP'},
  {cif:'B55309108',nombre:'AROTEC SEGURETAT, SLU'},
  {cif:'G59692657',nombre:'TELGRA PROJECTES I SISTEMES ELECTRONICS DE SEGURETAT, SL'},
  {cif:'52200910H',nombre:'CARLOS HIDALGO GARCIA'},
  {cif:'J17590522',nombre:'AP SISTEMES ELECTRONICS, SCP'},
  {cif:'30108589G',nombre:'VICTOR LOPEZ RIVAS'},
  {cif:'B17630161',nombre:'SEGURETAT EMPORDA, SL'},
  {cif:'46688000R',nombre:'JAVIER BABIANO VERA'},
  {cif:'B17403536',nombre:'SERVI INSTANT SEGURETAT, SL'},
  {cif:'B65053399',nombre:'SISTEMES INTEGRALS DE SEGURETAT ARCAT, SL'},
  {cif:'B66901331',nombre:'JYF COLOMA ALARMES 2016, SL'},
  {cif:'33966310W',nombre:'JAVIER CERDAN TORRAS'},
  {cif:'39033686H',nombre:'GABRIEL DORADO ALVAREZ'},
  {cif:'B63516637',nombre:'SEGURETAT MUNTAN, SL'},
  {cif:'A08668022',nombre:'APLICACIONES ELECTRICAS ENE, SA'},
  {cif:'40347256N',nombre:'JOSEP MARIA DALMAU AGUSTI (GI SEGURETAT)'},
  {cif:'43679030Y',nombre:'MARIA PILAR SANMARTIN MULERO'},
  {cif:'43737166K',nombre:'XAVIER MORENO COSTA (ALARMES ON)'},
  {cif:'B59315713',nombre:'SURIS SECURITY, SL'},
  {cif:'J62639430',nombre:'TRESSAT SEGURETAT, SCP'},
  {cif:'B60640075',nombre:'DELTA OEST, SL'},
  {cif:'B06977664',nombre:'ARBAT SISTEMAS DE SEGURIDAD, SL'},
  {cif:'B63139877',nombre:'BARNARAK SISTEMAS DE SEGURIDAD, SL'},
  {cif:'B56930431',nombre:'SISTEMAS SEGURMAR COSTA BRAVA, SL'},
  {cif:'B56993256',nombre:'SEGURETAT I ALARMES DE CATALUNYA, SL'},
  {cif:'B66764283',nombre:'ACORESTE, SL'},
  {cif:'B63630040',nombre:'MARINA EYE-CAM TECNOLOGIES, SL'},
  {cif:'B63911770',nombre:'CUVICBAGA INFORMATICA SL'},
  {cif:'B19916832',nombre:'SOLUTIONS 30 IBERIA SEGURIDAD, SL'},
  {cif:'B17860263',nombre:'ECOSS SISTEMAS DE SEGURIDAD, SL'},
  {cif:'B75373845',nombre:'PROTEL THE GUARD, SL'},
  {cif:'B21822325',nombre:'POLSER SEGURETAT, SL'},
  {cif:'47845593G',nombre:'ANDREU SOLDEVILA CASTANY'},
  {cif:'B17785395',nombre:'SEGURITEC COSTA BRAVA 2004, SL'},
];

async function main() {
  const r1 = await p.empresa.updateMany({ where: { cif: { in: pciAMixto } }, data: { sector: 'mixto' } });
  console.log('PCI -> mixto:', r1.count, 'empresas');

  await p.empresa.update({ where: { cif: 'A58281262' }, data: { enPerimetro: true } });
  console.log('M. BOADA -> enPerimetro: true');

  let inserted = 0;
  for (const e of nuevas) {
    await p.empresa.create({
      data: {
        cif: e.cif,
        nombre: e.nombre,
        sector: 'seguridad_electronica',
        enPerimetro: true,
        provincia: 'Cataluña',
        fuente: 'mossos_registry',
      }
    });
    inserted++;
  }
  console.log('Nuevas insertadas:', inserted);

  const total = await p.empresa.count();
  console.log('Total empresas en BD:', total);
  await p.$disconnect();
}
main().catch(e => { console.error(e.message); p.$disconnect(); });
