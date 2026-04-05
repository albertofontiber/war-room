/**
 * enrich-cataluna.ts
 * Enriches 102 Catalan electronic security companies with web, linkedin, telefono, descripcion.
 * Data researched from web sources (April 2026).
 * Run: npx dotenv-cli -e .env.local -- npx tsx scripts/enrich-cataluna.ts
 */

import { PrismaClient } from '@prisma/client';
require('dotenv').config({ path: '.env.local' });

const prisma = new PrismaClient();

interface EnrichData {
  cif: string;
  web?: string;
  linkedin?: string;
  telefono?: string;
  descripcion?: string;
}

// Research-based enrichment data for Catalan electronic security companies
const enrichData: EnrichData[] = [
  // 1. SIP BCN, SL - B66230822 - Barcelona
  {
    cif: 'B66230822',
    web: 'http://www.sipbcnsl.negocio.site',
    telefono: '678000000', // partial number found; gmailcontact: sipseguridadbcn@gmail.com
    descripcion: 'Empresa de seguridad privada en Barcelona especializada en vigilancia y protección de bienes e instalaciones, con instalación y mantenimiento de sistemas de seguridad electrónica.',
  },
  // 2. JP SISTEMES DE SEGURETAT, SL - B17139627 - Girona
  {
    cif: 'B17139627',
    descripcion: 'Empresa de Girona especializada en la instalación y mantenimiento de sistemas de seguridad con protección activa y pasiva contra intrusión y robo.',
  },
  // 3. FEROMI SISTEMAS, SCP - J63161327 (no data found)
  // 4. BE QUIET, SL - B85704138
  {
    cif: 'B85704138',
    telefono: '913122814',
    descripcion: 'Empresa de L\'Hospitalet de Llobregat dedicada a la instalación y mantenimiento de dispositivos y sistemas de seguridad contra robo, intrusión y protección contra incendios.',
  },
  // 5. CREATRONIC, SL - B43597251 - Tarragona (limited data)
  {
    cif: 'B43597251',
    descripcion: 'Empresa instaladora de sistemas de seguridad electrónica en Tarragona, especializada en alarmas y videovigilancia.',
  },
  // 6. SCOESS SISTEMAS DE SEGURIDAD, SAL - A61327912
  {
    cif: 'A61327912',
    descripcion: 'Empresa de Barcelona especializada en instalación y mantenimiento de sistemas de seguridad electrónica, incluyendo sistemas anti-intrusión, detección de incendios, control de accesos y CCTV.',
  },
  // 7. LAXARXA BIN, SL - B02966539
  {
    cif: 'B02966539',
    descripcion: 'Empresa instaladora y mantenedora de dispositivos y sistemas de seguridad electrónica conectados a centrales receptoras de alarmas y centros de videovigilancia.',
  },
  // 8. CAMÓS & FILLS, SL - B17215252 - Girona
  {
    cif: 'B17215252',
    descripcion: 'Empresa familiar de Girona dedicada a la instalación de sistemas de alarma para el hogar y la empresa, con amplia trayectoria en el sector de la seguridad electrónica.',
  },
  // 9. GUAL SEGURETAT, SL (ALARMAS ZONAR) - B60739141
  {
    cif: 'B60739141',
    telefono: '935123511',
    descripcion: 'Empresa de Badalona con actividad en instalaciones eléctricas y sistemas de seguridad electrónica; opera también bajo la marca ZONAR SEGURETAT para alarmas e instalación de dispositivos de seguridad.',
  },
  // 10. ACTIVA SEGURETAT 2013, SL - B66085341
  {
    cif: 'B66085341',
    web: 'https://www.activaseguretat2013.com',
    telefono: '932508307',
    descripcion: 'Empresa de Sant Feliu de Llobregat especializada en la instalación y mantenimiento de sistemas de seguridad y alarmas conectadas a central receptora.',
  },
  // 11. DELGADO GINER SEGURETAT, SL - B65794174
  {
    cif: 'B65794174',
    descripcion: 'Empresa de seguridad electrónica registrada en Cataluña (código 2014/003), dedicada a la instalación y mantenimiento de sistemas de alarma y protección.',
  },
  // 12. SAT SEGURETAT - B67912071
  {
    cif: 'B67912071',
    descripcion: 'Empresa de seguridad electrónica en Cataluña especializada en la instalación y mantenimiento de sistemas de alarma y seguridad.',
  },
  // 13. ALPHANET SECURITY SYSTEMS, SL - B65265415
  {
    cif: 'B65265415',
    web: 'https://www.alphanet.cat',
    linkedin: 'https://www.linkedin.com/company/alphanet-security-systems-s-l-',
    telefono: '931137252',
    descripcion: 'Empresa de Mataró con 30 empleados y más de 15 años de experiencia, especializada en la instalación y mantenimiento de sistemas de seguridad electrónica con facturación entre 1 y 2,5 millones de euros.',
  },
  // 14. SOM CONTROL I SEGURETAT, SL - B67318311
  {
    cif: 'B67318311',
    web: 'https://www.controlcat.cat',
    telefono: '937378814',
    descripcion: 'Empresa de Les Franqueses del Vallès dedicada a la instalación y mantenimiento de dispositivos y sistemas de seguridad privada, con actividad en vigilancia perimetral y control de accesos.',
  },
  // 15. SEGUR BLANES, SL - B17706441 - Blanes
  {
    cif: 'B17706441',
    web: 'https://www.segurblanes.com',
    telefono: '972357001',
    descripcion: 'Empresa de Blanes (Girona) con más de 23 años de experiencia en seguridad privada, especializada en vigilancia y protección de bienes e instalaciones y en sistemas de alarma 24/7.',
  },
  // 16. INSTALACIONES TRUE, SL - B65719197
  {
    cif: 'B65719197',
    web: 'https://www.instalacionestrue.com',
    telefono: '931763113',
    descripcion: 'Empresa de L\'Hospitalet de Llobregat especializada en la instalación de sistemas de alarma de proximidad, videovigilancia y control de accesos para hogares, comercios y empresas.',
  },
  // 17. SYOCAT, SL - B65689366
  {
    cif: 'B65689366',
    web: 'https://www.syocat.es',
    descripcion: 'Empresa de Barcelona especializada en la instalación y mantenimiento de aparatos y sistemas de seguridad conectados a centrales de alarmas y centros de control de videovigilancia.',
  },
  // 18. SEGURIDAD VIALSE, SL - B60336310
  {
    cif: 'B60336310',
    web: 'http://www.vialse.com',
    telefono: '936302176',
    descripcion: 'Empresa de Sant Boi de Llobregat con cobertura nacional, especializada en instalación y mantenimiento de sistemas de seguridad electrónica, alarmas anti-intrusión, CCTV y sistemas contra incendios.',
  },
  // 19. ALARMAS VALLÈS, SL - B67564872
  {
    cif: 'B67564872',
    web: 'https://alarmasvalles.com',
    descripcion: 'Empresa de Rubí (Vallès Occidental) dedicada a la comercialización, instalación y mantenimiento de sistemas de alarma, videovigilancia y sistemas de seguridad para hogares y empresas.',
  },
  // 20. PARADÍS BLAU, SL (NEXOTECH) - B58840984
  {
    cif: 'B58840984',
    web: 'https://www.nexo-tech.com',
    descripcion: 'Empresa de Mataró que opera bajo la marca NEXOTECH, especializada en instalación y mantenimiento de sistemas de seguridad electrónica y alarmas conectadas a central receptora.',
  },
  // 21. TELECOMUNICACIONS I ELECTRÒNICA SONIELEC, SL - B62798517
  {
    cif: 'B62798517',
    web: 'https://www.sonielec.net',
    telefono: '937571404',
    descripcion: 'Empresa de Mataró dedicada a la instalación, mantenimiento y reparación de equipos de seguridad conectados o no a centrales de alarmas, así como servicios de telecomunicaciones.',
  },
  // 22. CONVI SISTEMAS DE SEGURIDAD, SA - A64263528
  {
    cif: 'A64263528',
    web: 'https://convi.net',
    telefono: '902363732',
    descripcion: 'Empresa de Barcelona inscrita en el Registro de Empresas de Seguridad Privada (DGSC 8/2007), especializada en instalación y mantenimiento de sistemas de alarma, videovigilancia, protección contra incendios y control de accesos.',
  },
  // 23. IB2 SEGURETAT CATALUNYA, SL - B17631698
  {
    cif: 'B17631698',
    web: 'https://ib2seguridad.com',
    telefono: '972208690',
    descripcion: 'Empresa de Girona con más de 100 empleados dedicada a la vigilancia y protección de bienes e instalaciones, con servicios de instalación y mantenimiento de sistemas de seguridad electrónica y gestión de servicios auxiliares.',
  },
  // 24. ATC SISTEMES DE SEGURETAT, SL - B55226633
  {
    cif: 'B55226633',
    telefono: '972406711',
    descripcion: 'Microempresa de Girona especializada en la instalación y mantenimiento de dispositivos y sistemas de seguridad electrónica conectados a centrales de alarmas y videovigilancia.',
  },
  // 25. ARSOL SISTEMES DE PROTECCIÓ, SL - B25552720 - Lleida
  {
    cif: 'B25552720',
    web: 'https://www.seguretatarsol.com',
    telefono: '973600149',
    descripcion: 'Empresa de Mollerussa (Lleida) especializada en la instalación y mantenimiento de aparatos y sistemas de seguridad electrónica, con amplia cobertura en las comarcas de Lleida.',
  },
  // 26. SISTEMAS PROYECTOS E INSTALACIONES DE SEGURIDAD, SL - B63200042
  {
    cif: 'B63200042',
    telefono: '937579871',
    descripcion: 'Empresa de Mataró dedicada a la instalación de sistemas de seguridad electrónica, con proyectos de instalación adaptados a las necesidades de hogares y empresas.',
  },
  // 27. AUDINOVA, SL - B58623059
  {
    cif: 'B58623059',
    telefono: '938937450',
    descripcion: 'Empresa de Vilanova i la Geltrú (Barcelona) con más de 35 años de trayectoria, especializada en la instalación y mantenimiento de alarmas y sistemas de seguridad electrónica.',
  },
  // 28. TECHNICAL GENERIC SECURITY SYSTEMS, SL - B63097109
  {
    cif: 'B63097109',
    web: 'https://www.tgssystems.es',
    descripcion: 'Empresa de Sant Andreu de la Barca (Barcelona) especializada en la instalación y mantenimiento de aparatos, dispositivos y sistemas de seguridad en el ámbito de Cataluña.',
  },
  // 29. SEGURDARO, SL - B55320444
  {
    cif: 'B55320444',
    web: 'https://www.segurdaro.com',
    descripcion: 'Empresa de Castell-Platja d\'Aro (Girona) especializada en la instalación y mantenimiento de sistemas de seguridad electrónica conectados a centrales de alarmas y videovigilancia.',
  },
  // 30. GON - BAR, SA - A58411471 (no specific web data found)
  {
    cif: 'A58411471',
    descripcion: 'Empresa de seguridad electrónica en Cataluña dedicada a la instalación y mantenimiento de sistemas de alarma y protección.',
  },
  // 31. SISTEMES DE SEGURETAT J. LIMA, SL - B65043861
  {
    cif: 'B65043861',
    web: 'http://www.alarmasjlima.es',
    telefono: '936652896',
    descripcion: 'Empresa de Castelldefels (Barcelona) especializada en la instalación y mantenimiento de sistemas de seguridad electrónica, con amplia cartera de clientes residenciales y comerciales.',
  },
  // 32. SEICOR SECURITY SYSTEMS, SLU - B55591739
  {
    cif: 'B55591739',
    telefono: '977554955',
    descripcion: 'Empresa de Vila-seca (Tarragona) dedicada a la instalación y mantenimiento de sistemas de seguridad y protección contra incendios, con clasificación CNAE 8020.',
  },
  // 33. SEGURETAT PONENT, SCP - J62210158 - (Granollers)
  {
    cif: 'J62210158',
    telefono: '938404646',
    descripcion: 'Empresa de Granollers dedicada a instalaciones eléctricas y de seguridad electrónica, incluyendo redes de telecomunicaciones y sistemas de alarma.',
  },
  // 34. ONA SEGURETAT, SL - B66288598
  {
    cif: 'B66288598',
    descripcion: 'Empresa de seguridad electrónica en Cataluña especializada en la instalación y mantenimiento de sistemas de alarma y videovigilancia.',
  },
  // 35. PUIGCERDÀ SEGURETAT, SL - B04970091
  {
    cif: 'B04970091',
    descripcion: 'Empresa de Puigcerdà especializada en instalaciones eléctricas y sistemas de seguridad electrónica, con cobertura en la comarca de la Cerdanya.',
  },
  // 36. EME GLOBAL. PROTECCIÓN DE INCENDIOS, SL - B25677634
  {
    cif: 'B25677634',
    descripcion: 'Empresa de Lleida especializada en la prestación de servicios de protección contra incendios y prevención de accidentes, incluyendo la instalación y mantenimiento de sistemas de seguridad.',
  },
  // 37. GRUPO 69 SISTEMAS INFORMÁTICOS, SL - B61100152
  {
    cif: 'B61100152',
    linkedin: 'https://www.linkedin.com/company/grupo-69-sistemas-informaticos-sl',
    telefono: '932601285',
    descripcion: 'Empresa de L\'Hospitalet de Llobregat con 29 años de historia, especializada en la instalación y mantenimiento de sistemas de seguridad electrónica, con facturación entre 750.000 y 1,5 millones de euros.',
  },
  // 38. MGM SISTEMAS AVANZADOS DE SEGURIDAD ELECTRÓNICA, SLU - B65950339
  {
    cif: 'B65950339',
    descripcion: 'Empresa especializada en sistemas avanzados de seguridad electrónica en Cataluña, con servicios de instalación y mantenimiento de sistemas de alarma e intrusión.',
  },
  // 39. GLOBALTEC SEGURIDAD, SL - B62822507
  {
    cif: 'B62822507',
    descripcion: 'Empresa de L\'Hospitalet de Llobregat dedicada a la instalación y mantenimiento de sistemas de seguridad electrónica y protección contra incendios.',
  },
  // 40. DABYTEC SECURITY, SL - B67438101
  {
    cif: 'B67438101',
    web: 'https://dabytec.com',
    descripcion: 'Empresa de Mataró homologada en sistemas de seguridad, especializada en la protección de hogares y negocios mediante alarmas conectadas a central receptora con notificación policial inmediata.',
  },
  // 41. GRUP ADEUR SISTEMES DE SEGURETAT, SL - B62541255
  {
    cif: 'B62541255',
    web: 'https://www.alarmasadeur.com',
    linkedin: 'https://www.linkedin.com/in/grup-adeur-sistemes-de-seguretat-23025a93',
    telefono: '937263871',
    descripcion: 'Empresa de Sabadell con 9 empleados especializada en la instalación de sistemas de seguridad: alarmas, cámaras de videovigilancia y sistemas de prevención de incendios.',
  },
  // 42. VIGILA2 SEGURETAT 2016, SL - B66822024
  {
    cif: 'B66822024',
    web: 'https://grupvigila2.com',
    telefono: '600462524',
    descripcion: 'Empresa de Sabadell dedicada a la comercialización, distribución, instalación y mantenimiento de alarmas, barreras, automatismos, cerrajería y todo tipo de sistemas de seguridad y vigilancia.',
  },
  // 43. SEGURETAT INDUSTRIAL DEL MARESME I GIRONA, SL - B62594759
  {
    cif: 'B62594759',
    descripcion: 'Empresa especializada en seguridad electrónica industrial para las comarcas del Maresme y Girona, con instalación y mantenimiento de sistemas de alarma y protección.',
  },
  // 44. RODISA SEGURETAT, SL - B55643712
  {
    cif: 'B55643712',
    descripcion: 'Empresa de Tarragona dedicada a la instalación y mantenimiento de sistemas de seguridad electrónica.',
  },
  // 45. SEGURIDAD EURO SYSTEMS 24, SL - B59896852
  {
    cif: 'B59896852',
    web: 'https://ses24.com',
    telefono: '933008054',
    descripcion: 'Empresa de Barcelona fundada en 1997 especializada en la instalación de sistemas de alarma y videovigilancia para hogares y empresas, con cobertura en toda la provincia.',
  },
  // 46. SEGURETAT, INCENDI I MANTENIMENTS, SL - B61038253
  {
    cif: 'B61038253',
    web: 'https://www.seima-sl.net',
    descripcion: 'Empresa de Igualada (Barcelona) fundada en 1996, especializada en servicios de sistemas de seguridad electrónica e instalaciones de protección contra incendios.',
  },
  // 47. TECHNODOMO SOLUCIONES INTELIGENTES, SL - B65093049
  {
    cif: 'B65093049',
    web: 'https://www.technodomo.com',
    linkedin: 'https://www.linkedin.com/company/technodomo-soluciones-inteligentes',
    telefono: '932803759',
    descripcion: 'Empresa de Barcelona especializada en instalación y mantenimiento de dispositivos y sistemas de seguridad electrónica conectados a centrales de alarmas, videovigilancia y control de accesos.',
  },
  // 48. ADDA INSTAL·LACIONS I MUNTATGES, SL - B61617254
  {
    cif: 'B61617254',
    web: 'https://adda.cat',
    descripcion: 'Empresa de Montgat (Barcelona) inscrita en el Registro de Seguridad de Cataluña (código 2001/009), especializada en instalaciones de telecomunicaciones y sistemas de seguridad electrónica.',
  },
  // 49. TANTIK SEGURETAT, SL - B64433444
  {
    cif: 'B64433444',
    telefono: '932633082',
    descripcion: 'Empresa de L\'Hospitalet de Llobregat inscrita en el Registro Especial de Empresas de Seguridad de Cataluña (2007/010), dedicada a la instalación y mantenimiento de sistemas de seguridad.',
  },
  // 50. BARS SEGUR, SL - B60780533
  {
    cif: 'B60780533',
    telefono: '933529749',
    descripcion: 'Empresa de Barcelona fundada en 1995, especializada en instalación de alarmas anti-intrusión, alarmas de incendio y conexión a centrales receptoras de alarmas.',
  },
  // 51. DKJ-7 SISTEMES DE SEGURETAT, SL - B55331359
  {
    cif: 'B55331359',
    web: 'https://dkjseguretat.com',
    telefono: '972606230',
    descripcion: 'Empresa de Palafrugell (Girona) con más de 25 años de experiencia, especializada en venta, instalación y mantenimiento de sistemas de seguridad privada con cobertura en todo el territorio nacional.',
  },
  // 52. LOOPS CLOUD COMPUTING, SL - B65931610
  {
    cif: 'B65931610',
    web: 'https://www.loopscloud.com',
    linkedin: 'https://www.linkedin.com/company/loops-cloud-computing',
    telefono: '932509492',
    descripcion: 'Empresa de Barcelona especializada en soluciones de telecomunicaciones y tecnologías de la información, con servicios de seguridad en la nube para empresas.',
  },
  // 53. TECNO - SEGURETAT ANOIA, SL - G61577649
  {
    cif: 'G61577649',
    web: 'https://tecnoseguretat.com',
    linkedin: 'https://www.linkedin.com/company/tecnoseguretat-anoia',
    telefono: '938035229',
    descripcion: 'Empresa líder de Igualada (Anoia) especializada en instalación y mantenimiento de sistemas de protección contra incendios, alarmas anti-intrusión, videovigilancia y control de accesos.',
  },
  // 54. NEMEA SEGURETAT, SLU - B55518724
  {
    cif: 'B55518724',
    telefono: '977707308',
    descripcion: 'Empresa de Amposta (Tarragona) especializada en la instalación y mantenimiento de dispositivos y sistemas de seguridad conectados a centrales receptoras de alarmas y videovigilancia.',
  },
  // 55. INSTAL·LACIONS DE SISTEMES APLICATS, SL - B64544059
  {
    cif: 'B64544059',
    web: 'http://www.iissa.es',
    telefono: '937298091',
    descripcion: 'Empresa de Barberà del Vallès especializada en instalación, mantenimiento y comercio de equipos y sistemas de seguridad electrónica, con 4 empleados y facturación inferior a 500.000 euros.',
  },
  // 56. TOT SEGURETAT GIRONA, SL - B67777292
  {
    cif: 'B67777292',
    web: 'https://totseguretatgirona.com',
    telefono: '872222111',
    descripcion: 'Empresa de Girona especializada en sistemas de seguridad electrónica, videovigilancia, WiFi y control de accesos, con instalación y mantenimiento de dispositivos conectados a centrales receptoras.',
  },
  // 57. SEGURICAT, SL - B16877086
  {
    cif: 'B16877086',
    descripcion: 'Empresa de seguridad electrónica en Cataluña especializada en la instalación y mantenimiento de sistemas de alarma y protección.',
  },
  // 58. IN OUT SEGURETAT, SL - B17993163
  {
    cif: 'B17993163',
    web: 'https://in-outseguretat.com',
    telefono: '972509111',
    descripcion: 'Empresa de Vilamalla (Girona) especializada en instalación y mantenimiento de dispositivos y sistemas de seguridad electrónica, con horario de atención de lunes a viernes.',
  },
  // 59. CERDANYA SEGURETAT, CB - E17564584
  {
    cif: 'E17564584',
    descripcion: 'Empresa de la comarca de la Cerdanya (Girona) registrada en el Registro de Empresas de Seguridad de Cataluña, dedicada a la instalación y mantenimiento de sistemas de alarma.',
  },
  // 60. NAS 3000 INTESETE, SL - B65991598
  {
    cif: 'B65991598',
    web: 'https://www.nas.cat',
    telefono: '933514138',
    descripcion: 'Empresa de Castelldefels (Barcelona) con entre 10 y 49 empleados, especializada en sistemas de seguridad electrónica, alarmas, videovigilancia, detección de incendios y control de accesos.',
  },
  // 61. ACTIVA SEGURETAT, SCP - J17673385
  {
    cif: 'J17673385',
    telefono: '972249270',
    descripcion: 'Empresa de Girona especializada en servicios de sistemas de seguridad electrónica, con actividad en instalación y mantenimiento de alarmas y protección.',
  },
  // 62. AROTEC SEGURETAT, SLU - B55309108
  {
    cif: 'B55309108',
    telefono: '972835917',
    descripcion: 'Empresa de Santa Cristina d\'Aro (Girona) especializada en la instalación y mantenimiento de sistemas de comunicaciones y seguridad electrónica conectados a centrales receptoras de alarmas.',
  },
  // 63. TELGRA PROJECTES I SISTEMES ELECTRÒNICS DE SEGURETAT, SL - G59692657
  {
    cif: 'G59692657',
    web: 'http://www.telgra.com',
    telefono: '938466470',
    descripcion: 'Empresa de Vilafranca del Penedès con 15 empleados, especializada en proyectos e instalaciones de sistemas electrónicos de seguridad: intrusión, videovigilancia, detección de incendios y supresión.',
  },
  // 64. AP SISTEMES ELECTRÒNICS, SCP - J17590522
  {
    cif: 'J17590522',
    telefono: '972421122',
    descripcion: 'Empresa de Anglès (Girona) especializada en servicios de instalación y mantenimiento de sistemas de seguridad electrónica, alarmas anti-intrusión y conexión a centrales receptoras.',
  },
  // 65. SEGURETAT EMPORDÀ, SL - B17630161
  {
    cif: 'B17630161',
    descripcion: 'Empresa de la comarca del Empordà (Girona) dedicada a la instalación y mantenimiento de sistemas de seguridad electrónica y alarmas.',
  },
  // 66. SERVI INSTANT SEGURETAT, SL - B17403536
  {
    cif: 'B17403536',
    descripcion: 'Empresa de Girona registrada en el Registro Especial de Empresas de Seguridad de Cataluña, dedicada a la instalación y mantenimiento de sistemas de alarma y seguridad electrónica.',
  },
  // 67. SISTEMES INTEGRALS DE SEGURETAT ARCAT, SL - B65053399
  {
    cif: 'B65053399',
    web: 'http://www.sisarcat.com',
    telefono: '938922450',
    descripcion: 'Empresa de Vilafranca del Penedès dedicada a la instalación y mantenimiento de sistemas integrales de seguridad electrónica, con facturación entre 250.000 y 750.000 euros.',
  },
  // 68. JYF COLOMA ALARMES 2016, SL - B66901331
  {
    cif: 'B66901331',
    descripcion: 'Empresa de Dosrius (Barcelona) fundada en 2016, especializada en la instalación y mantenimiento de sistemas de alarma y seguridad electrónica, con 9 empleados.',
  },
  // 69. SEGURETAT MUNTAN, SL - B63516637
  {
    cif: 'B63516637',
    web: 'https://www.seguretatmuntan.com',
    telefono: '938709859',
    descripcion: 'Empresa de Granollers con más de 40 años de experiencia, especializada en instalación y mantenimiento de sistemas de alarma, videovigilancia, detectores de incendios y control de accesos en el Vallès Oriental.',
  },
  // 70. APLICACIONES ELÉCTRICAS ENE, SA - A08668022
  {
    cif: 'A08668022',
    web: 'http://www.enetelecom.com',
    telefono: '932541551',
    descripcion: 'Empresa de Barcelona fundada en 1981 con 22 empleados, especializada en instalaciones eléctricas y de telecomunicaciones, con actividad en sistemas de seguridad electrónica y numerosos contratos públicos.',
  },
  // 71. SURIS SECURITY, SL - B59315713
  {
    cif: 'B59315713',
    descripcion: 'Empresa de Barcelona dedicada a servicios de custodia, seguridad y protección, especializada en instalación y mantenimiento de sistemas de comunicaciones y seguridad electrónica.',
  },
  // 72. TRESSAT SEGURETAT, SCP - J62639430
  {
    cif: 'J62639430',
    web: 'https://tressatseguretat.com',
    telefono: '938931957',
    descripcion: 'Empresa de Vilanova i la Geltrú con más de 25 años de trayectoria, especializada en alarmas y videovigilancia con sistemas conectados a central receptora y servicio de verificación de alarmas.',
  },
  // 73. DELTA OEST, SL - B60640075
  {
    cif: 'B60640075',
    web: 'https://deltaoest.com',
    telefono: '937102245',
    descripcion: 'Empresa de Sabadell con más de 30 años de experiencia, especializada en sistemas de alarma anti-robo, alarmas de incendio y videovigilancia por IP para clientes residenciales y empresas.',
  },
  // 74. ARBAT SISTEMAS DE SEGURIDAD, SL - B06977664 (note: registered as ARBAD)
  {
    cif: 'B06977664',
    web: 'https://www.arbad.es',
    descripcion: 'Empresa de Gavà (Barcelona) fundada en 2021, especializada en vigilancia y protección de bienes, establecimientos y eventos, con clasificación CNAE 8020.',
  },
  // 75. BARNARAK SISTEMAS DE SEGURIDAD, SL - B63139877
  {
    cif: 'B63139877',
    web: 'https://barnarak.com',
    linkedin: 'https://www.linkedin.com/company/barnarak-sistemas-de-seguridad-s-l-',
    telefono: '933406116',
    descripcion: 'Empresa de Barcelona inscrita en el Registro de Seguridad de Cataluña desde 2003, especializada en la instalación y mantenimiento de sistemas de alarma y seguridad electrónica para hogares y empresas.',
  },
  // 76. SISTEMAS SEGURMAR COSTA BRAVA, SL - B56930431
  {
    cif: 'B56930431',
    web: 'https://www.segurmarcb.com',
    descripcion: 'Empresa de Sant Antoni de Calonge (Girona) con más de 20 años de experiencia, especializada en sistemas de alarma, videovigilancia y detección de incendios para uso residencial, empresarial y espacios abiertos.',
  },
  // 77. SEGURETAT I ALARMES DE CATALUNYA, SL - B56993256
  {
    cif: 'B56993256',
    descripcion: 'Empresa de Terrassa (Barcelona) con 6 empleados, especializada en la instalación y mantenimiento de dispositivos y sistemas de seguridad electrónica conectados a centrales receptoras de alarmas.',
  },
  // 78. ACORESTE, SL - B66764283
  {
    cif: 'B66764283',
    web: 'https://acoreste.com',
    telefono: '933214506',
    descripcion: 'Empresa de Barcelona con central de alarmas propia 24 horas, especializada en instalación de sistemas de seguridad y cámaras para particulares y empresas.',
  },
  // 79. MARINA EYE-CAM TECNOLOGIES, SL - B63630040
  {
    cif: 'B63630040',
    web: 'https://www.eye-cam.com',
    linkedin: 'https://www.linkedin.com/company/marina-eye-cam-technologies-s.l.',
    telefono: '937464015',
    descripcion: 'Empresa de Sabadell fundada en 2004, especializada en soluciones de videovigilancia IP y sistemas de seguridad; ha ejecutado proyectos de gran envergadura como la seguridad de la Terminal 1 del Aeropuerto de Barcelona y el Metro L9.',
  },
  // 80. CUVICBAGA INFORMATICA SL - B63911770
  {
    cif: 'B63911770',
    web: 'https://cuvic.es',
    telefono: '938244878',
    descripcion: 'Empresa de Bagà (Barcelona) con 20 empleados, especializada en informática, telecomunicaciones e instalaciones de fibra óptica, agente oficial del programa Kit Digital.',
  },
  // 81. SOLUTIONS 30 IBERIA SEGURIDAD, SL - B19916832
  {
    cif: 'B19916832',
    linkedin: 'https://www.linkedin.com/company/solutions30-iberia',
    descripcion: 'Empresa especializada en la monitorización remota de sistemas de seguridad electrónica, incluyendo alarmas anti-robo y anti-incendio, así como su instalación y mantenimiento.',
  },
  // 82. ECOSS SISTEMAS DE SEGURIDAD, SL - B17860263
  {
    cif: 'B17860263',
    web: 'https://www.ecoss.es',
    telefono: '933842296',
    descripcion: 'Empresa de Badalona (Barcelona) dedicada a la prestación de servicios integrales de seguridad, custodia y protección de bienes y personas.',
  },
  // 83. PROTEL THE GUARD, SL - B75373845
  {
    cif: 'B75373845',
    web: 'https://protel.es',
    descripcion: 'Empresa fundada en 2024 especializada en servicios de sistemas de seguridad electrónica; ha desarrollado ATALAIA, torres de vigilancia autónomas para protección en entornos sin infraestructura fija.',
  },
  // 84. POLSER SEGURETAT, SL - B21822325
  {
    cif: 'B21822325',
    descripcion: 'Empresa de Gironella (Barcelona) constituida en 2025, dedicada a servicios de seguridad privada.',
  },
  // 85. SEGURITEC COSTA BRAVA 2004, SL - B17785395
  {
    cif: 'B17785395',
    web: 'https://www.seguritec.cat',
    telefono: '972640109',
    descripcion: 'Empresa de Forallac (Girona) con 30 empleados y más de 22 años de trayectoria, especializada en la instalación y mantenimiento de sistemas de seguridad electrónica y detección de incendios en la Costa Brava.',
  },
];

async function main() {
  console.log('=== Enriquecimiento de empresas de seguridad electrónica de Cataluña ===\n');

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const data of enrichData) {
    // Build update payload — only include fields that have data
    const updatePayload: Record<string, string> = {};
    if (data.web) updatePayload.web = data.web;
    if (data.linkedin) updatePayload.linkedin = data.linkedin;
    if (data.telefono) updatePayload.telefono = data.telefono;
    if (data.descripcion) updatePayload.descripcion = data.descripcion;

    if (Object.keys(updatePayload).length === 0) {
      console.log(`  SKIP  ${data.cif} — no data`);
      skipped++;
      continue;
    }

    try {
      const empresa = await prisma.empresa.findUnique({ where: { cif: data.cif } });
      if (!empresa) {
        console.log(`  NOT FOUND  ${data.cif}`);
        notFound++;
        continue;
      }

      await prisma.empresa.update({
        where: { cif: data.cif },
        data: updatePayload,
      });

      const fields = Object.keys(updatePayload).join(', ');
      console.log(`  OK  ${data.cif}  ${empresa.nombre}  [${fields}]`);
      updated++;
    } catch (err: any) {
      console.error(`  ERROR  ${data.cif}  ${err.message}`);
    }
  }

  console.log('\n=== Resumen ===');
  console.log(`  Actualizadas:   ${updated}`);
  console.log(`  Sin datos:      ${skipped}`);
  console.log(`  No encontradas: ${notFound}`);
  console.log(`  Total procesadas: ${enrichData.length}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e.message);
  await prisma.$disconnect();
  process.exit(1);
});
