# Estado actual del proyecto

Corte: **25 de octubre de 2026, Europe/Madrid**. Base de código: [#206](https://github.com/albertofontiber/war-room/pull/206), fusionada en `26b1f1e`, con soporte de descripción en nuevas altas. Datos: duodécimo lote y complemento de descripción de Fugoroba aplicados y verificados en producción, además de los lotes anteriores. Es una instantánea fechada, no un contador en vivo.

## Datos comprobados

Consulta a la base configurada para producción mediante Prisma dentro de una transacción `READ ONLY`, después de aplicar el lote de pasiva. Las altas y enriquecimientos previos se auditaron por separado; el recuento no realizó escrituras.

| Métrica | Resultado | Definición |
|---|---:|---|
| Empresas del universo | 5.901 | `Empresa` con `esAnonima=false` |
| Sector PCI | 4.663 | Valor `PCI` |
| Seguridad electrónica | 770 | Valor `seguridad_electronica` |
| Mixtas | 468 | PCI y seguridad electrónica; no significa activa y pasiva |
| Pasiva confirmada | 317 | `proteccionPasiva=true`; cobertura parcial, no censo del mercado |
| Fichas de pasiva con descripción inicial | 317 | Cero descripciones vacías; tres nuevas con resumen y descripción de Fugoroba completada; 312 textos previos conservados |
| Actividad PCI activa | 4.994 | Universo PCI/mixto previo y categorías RIPCI válidas; excluye altas de investigación pasiva sin evidencia de activa |
| Actividad seguridad electrónica | 1.238 | Sectores `seguridad_electronica` o `mixto` |
| PCI activa y PCI pasiva | 178 | Ambas actividades; pueden prestar también seguridad electrónica |
| Las tres actividades | 28 | PCI activa, PCI pasiva y seguridad electrónica |
| Solo PCI pasiva acreditada | 138 | Lista de actividades con únicamente pasiva; no constituye revisión negativa de las otras actividades |
| Años de cuentas | 23.620 | Filas de `Financiero`; no número de empresas |
| Cuentas del ejercicio 2025 | 2.725 | Filas con `anio=2025`, todas las fuentes |
| Años de cuentas de la extracción SABI de octubre | 15.766 | Filas con `fuente=sabi_2610` |
| Empresas con web no nula | 3.468 | El dato no acredita que todas las webs funcionen o estén validadas |
| En perímetro sin web | 1.491 | `enPerimetro=true`, web nula o vacía y no anónima |
| Empresas con coordenadas en las API de mapa/tabla | 5.269 | Las listas geográficas excluyen coordenadas nulas; no es el total del universo |
| Empresas con áreas Cepreven de pasiva guardadas | 3 | Algún código `PAS-COMP`, `PAS-REAC` o `PAS-ESTR`; separado de la nueva actividad transversal |

### Estado legal SABI

| Estado | Empresas |
|---|---:|
| Activa | 4.122 |
| Activa en concurso | 15 |
| Disuelta | 130 |
| Disuelta por fusión/absorción | 61 |
| Liquidación | 56 |
| Quiebra | 46 |
| Inactiva | 9 |
| Situación desconocida | 46 |
| No encontrada en SABI | 1.278 |
| Sin consultar | 138 |

El total de estados coincide con el universo del corte. No encontrada en SABI no implica inactividad. Las altas de pasiva conservan `estado=null` hasta una consulta SABI; no se han clasificado como activas por su web. Las métricas de actividad se solapan y no deben sumarse como sectores excluyentes. Su [criterio compartido](ACTIVIDADES.md) incorpora la aclaración de Alberto del 24/10 sobre PCI activa en el universo previo.

Las diez migraciones versionadas hasta `20261023140000_proteccion_pasiva` constan aplicadas, sin pendientes. La presencia de estados y filas `sabi_2610` acredita la carga de octubre en la base.

### Cambio respecto al corte anterior

La duodécima tanda revisa **40 candidatas y fichas**, incluidas las **15 pendientes de la undécima**, mediante AISLA, Tecnifuego, AD’IP, Cepreven y búsqueda regional. Aplica **3 altas y 3 enriquecimientos**: el universo pasa de **5.898 a 5.901 empresas** y las confirmadas de PCI pasiva, de **312 a 317**. El [duodécimo lote](research/pasiva-validada-ampliacion10-2026-10-25.json) incluye descripción inicial en todas las altas; el [seguimiento vigente](research/pasiva-ampliacion10-seguimiento-2026-10-25.json) documenta una decisión por cada pendiente anterior y los demás casos revisados.

Las tres altas resuelven candidatas pendientes: **Aislamientos Eduardo Castillo / Aislamientos Zaragoza**, **Incopac 90** y **Revestimientos de Pinturas y Espumas Aislantes / Redepesa**. No existían por CIF/NIF, nombre ni dominio. Incopac aporta obras propias en su blog técnico histórico, enlazado desde el dominio corporativo, y mantiene oferta actual de pasiva. Redepesa ejecuta ignifugación estructural; fuentes oficiales enlazan titular y marca. Se utiliza su domicilio de Sevilla publicado en BORME en 2022, posterior al de Jazmines 43 de Osuna; el contacto operativo de la web en Osuna queda documentado. No se crean entidades por puntos de venta o áreas atendidas.

**Fugoroba (995)** y **AB Seguridad / Adell Bolde (1143)** se confirman por primera vez en sus fichas existentes. **Aplicaciones Antúnez / Aplan (5848)** ya estaba confirmada y añade compartimentación. Fugoroba tenía `descripcion` vacía: se completa mediante [lote separado](research/descripciones-pasiva-ampliacion10-2026-10-25.json), con una auditoría y repetición `sin_cambios=1`. Las otras descripciones y todos los campos ajenos a pasiva se conservan, con esa única excepción de resumen expresamente verificada.

El lote de actividad genera **6 auditorías** y repetir devuelve `sin_cambios=6`; no hay identidades ambiguas. Se conservan por huella cuentas, CRM y recuentos relacionados de las tres existentes, con **23.620** filas financieras sin variación. Las tres altas quedan fuera de perímetro y sin estado SABI, con coordenadas municipales. Pasan los **11 tests** de pasiva/importador; la API de producción verifica seis CIF/NIF únicos, sus seis fichas con fuentes y descripción, 16 combinaciones y exportación de **317** confirmadas. El barrido de las 317 encuentra cero descripciones vacías y conserva los 312 textos previos exactamente.

De las quince pendientes anteriores, tres se incorporan y doce no reciben alta: nueve mantienen una validación concreta pendiente; ZAT, Aislatodo y Tabinorba quedan fuera del alta inmediata en este corte, sin clasificación negativa en la base. Para ZAT, el BOE acredita una revocación histórica del NIF en 2022, sin deducir situación vigente ni ausencia de rehabilitación; falta además ejecución primaria actual. Tecfire se añade como nueva candidata pendiente de identidad fiscal primaria. Zamora sigue sin confirmadas domiciliadas; la cobertura del mercado continúa siendo parcial.

### Corte histórico de la undécima tanda

La undécima tanda revisa **31 candidatas y fichas** mediante AISLA, ASIME, AD’IP y búsqueda regional. Aplica **7 altas y 3 enriquecimientos**: el universo pasa de **5.891 a 5.898 empresas** y las confirmadas de PCI pasiva, de **303 a 312**. El [undécimo lote](research/pasiva-validada-ampliacion9-2026-10-25.json) incorpora descripción inicial en todas las altas. El [seguimiento de la undécima tanda](research/pasiva-ampliacion9-seguimiento-2026-10-25.json) distingue diez escrituras, seis fichas ya confirmadas sin escritura y quince casos sin prueba suficiente.

Las altas son **Aisla Vida, Fiseco, Ebroplac Spain / REVES, Revestimientos Juncaril, Salvador López Parra / Lodipar Industrial, Aislamientos Burgaleses y Chorro Naval**. No existían por CIF/NIF, nombre ni dominio. REVES deja de estar pendiente: el aviso identifica B99329781 y BORME recoge el cambio de Estructuras y Reves a Ebroplac Spain en 2025. Lodipar se incorpora bajo el NIF profesional público de su titular. Se omite el CP de Fiseco por discrepancia entre fuentes, sin inventar su razón social.

**Emex (2184)** se confirma por instalación y mantenimiento de puertas y cortinas cortafuegos; **3 Fuegos (2827)**, por ejecución de ignifugaciones; **Teprosol (5809)** ya estaba confirmada y añade protección de conductos. Se conservan las descripciones y todos los campos ajenos a pasiva de las tres existentes, incluidos cuentas, CRM y recuentos de tareas/notas/contactos. Las siete altas quedan fuera de perímetro, sin estado SABI, con web, identidad, domicilio y coordenadas municipales.

La simulación no deja identidades para revisar. Se generan **10 auditorías** y repetir devuelve `sin_cambios=10` sin nuevas escrituras. Pasan los **11 tests** de pasiva/importador; la API de producción verifica diez CIF/NIF únicos en lite/full, diez fichas con fuentes y descripción inicial, las 16 combinaciones de actividades y exportación de **312** confirmadas. Se mantienen las **23.620** filas financieras. El barrido de las 312 confirmadas encuentra cero descripciones vacías y conserva exactamente los 303 textos anteriores.

La cobertura aumenta en nueve provincias; Zamora sigue sin confirmadas domiciliadas, sin inferir ausencia de oferta. No se crean entidades por las páginas regionales de Apisur, Igesur, Igniwool, CYPSA, Procaval o Los Montes. PYL Bages, CRM Gia y otras pistas siguen pendientes de identidad; las plantillas fiscales de Ignifugaciones Andalucía no permiten el alta. La consulta de pendientes es acotada, con antecedente explícito para los no reconsultados.

### Corte histórico de la décima tanda

La décima tanda del 25/10 revisa **32 candidatas y fichas** con foco en puertas y cortinas cortafuegos —incluidas irrigadas— y conductos resistentes al fuego. Aplica **8 altas y 6 enriquecimientos**: el universo pasa de **5.883 a 5.891 empresas** y las confirmadas de PCI pasiva, de **291 a 303**. El [décimo lote](research/pasiva-validada-ampliacion8-2026-10-25.json) conserva identidad fiscal, ejecución y localización; el [seguimiento de la décima tanda](research/pasiva-ampliacion8-seguimiento-2026-10-25.json) distingue 14 fichas modificadas, cuatro ya confirmadas sin escritura, 13 casos sin confirmación suficiente y un fabricante sin ejecución de pasiva contrastada.

Las ocho altas son **Creani, Tecomsa Gestión, Proybor Protección Pasiva, Krode, Portes Bisbal / Àngel Mir, DrHumo Soluciones y Servicios, Miguel Naveira Martínez / Automatismos Naveira y Collbaix Canarias**. No existían por CIF/NIF, nombre o dominio en el universo previo. Se incorporan bajo el titular real, también el autónomo, sin fichas por marcas o delegaciones. Proybor usa CIF de una adjudicación oficial y domicilio de Getafe publicado en BORME en 2023, posterior al de la web; se omite código postal no corroborado. Los documentos históricos no acreditan estado legal actual.

**Aficon (2781), Nevada Fire (3090), Sistemas Guadalquivir (2652) y Energimac (1386)** se confirman por primera vez como pasiva. **CISA / Control Ignífugo (5794)** ya estaba confirmada y añade protección de conductos; **Mecosa (5899)** precisa la evidencia de cortinas irrigadas y sin irrigación en el servicio actual de puertas. Se conserva la otra ficha homónima de Sistemas Guadalquivir, con NIF distinto. Catorce fichas trabajadas añaden doce confirmaciones.

La simulación no dejó filas para revisar. Se generaron **14 auditorías** y repetir el lote devuelve `sin_cambios=14`, sin nuevas escrituras. Se conservan por huella todos los campos ajenos a pasiva de las seis existentes, sus cuentas, CRM y recuentos de tareas/notas/contactos; permanecen las **23.620** filas financieras. Las altas quedan fuera de perímetro y sin estado SABI. Pasan los **11 tests** de pasiva/importador. La API de producción comprueba 14 CIF/NIF únicos en lite/full, sus 14 fichas con fuentes, 16 combinaciones y exportación de **303** confirmadas.

La cobertura aumenta en nueve provincias; Zamora sigue sin confirmadas en nuestra base, sin inferir ausencia de oferta. Las coordenadas nuevas son centros municipales salvo Portes Bisbal, que usa el centro de la localidad de Cruïlles; ninguna tiene precisión de portal. Gruman queda pendiente porque su web actual devuelve una plantilla/404 frente al contenido del índice. Insonotec requiere atribuir fiscalmente el nuevo dominio antes de trasladar servicios. Las consultas acotadas de Global Fire, AMS/ASM, Parfoc, Igniva y PYL Bages no resuelven sus identidades; no se reconsultan todos los pendientes históricos.

### Complemento de resúmenes de empresa

Las ocho altas de la décima tanda y CISA, Mecosa y Energimac carecían del resumen inicial en `descripcion`. Se completan con once textos breves y [fuentes documentadas](research/descripciones-pasiva-ampliacion8-2026-10-25.json); las tres descripciones ya existentes se conservan. Las catorce fichas de esa tanda tienen ahora resumen. Se generan once auditorías y la repetición devuelve `sin_cambios=11`; se conservan por huella el resto de campos y datos relacionados de las catorce fichas. La API de producción devuelve los once textos guardados. No cambian los recuentos anteriores ni las actividades, cuentas, CRM, perímetro o estados SABI.

### Resúmenes de las tandas anteriores

Se revisan las **303 fichas con PCI pasiva confirmada** y se completan **173 descripciones vacías** de las tandas primera a novena, conservando las **130 existentes**. Quedan **cero fichas de pasiva confirmada sin descripción inicial**. El [lote de resúmenes históricos](research/descripciones-pasiva-historicas-2026-10-25.json) conserva textos, fuentes, antecedentes y un reparto por primera tanda sin duplicar empresas reconsultadas.

El criterio es el de PCI activa: una o dos frases de actividad y servicios acreditados, con alcance general cuando no hay detalle suficiente. No se añaden habilitaciones, calificaciones vigentes, cifras ni especialidades inferidas. Se generan **173 auditorías**; repetir devuelve `sin_cambios=173` sin nuevas escrituras. Se conservan por huella los campos ajenos a descripción, las cuentas, el CRM y los recuentos de tareas/notas/contactos de las **303 fichas**. La API de producción verifica las **303 descripciones**, incluidos los 130 textos conservados, y una sola ficha por CIF/NIF en la lista. En ese corte se mantienen 5.891 empresas y 23.620 filas financieras.

### Corte histórico de la novena tanda

La novena tanda del 25/10 revisa **35 casos** —incluidas **16 fichas existentes sin web**— y aplica **3 altas y 3 enriquecimientos**. El universo pasa de **5.880 a 5.883 empresas** y las confirmadas de PCI pasiva, de **286 a 291**. El [noveno lote](research/pasiva-validada-ampliacion7-2026-10-25.json) conserva identidad fiscal primaria, ejecución, fuentes y coordenadas municipales. El [seguimiento de la novena tanda](research/pasiva-ampliacion7-seguimiento-2026-10-25.json) distingue seis fichas modificadas, cuatro ya confirmadas sin escritura, 23 casos sin confirmación suficiente y dos distribuidores sin ejecución propia contrastada. No son 35 altas ni un barrido de todas las fichas sin web.

Las tres altas son **Garrepal** (Fuentes de Valdepero, Palencia), **Cerrajes y Metálicas Arranz** (Torrecilla del Pinar, Segovia) y **Montajes Segovia** (Humanes de Madrid, Madrid). No existían por CIF, nombre o dominio en el universo previo. Metálicas Arranz deja de estar pendiente: el aviso legal y el anuncio oficial del contrato municipal 89/2024 de Pinarejos identifican B40147118. El contrato de carpintería acredita identidad histórica; la ejecución de pasiva se acredita en la web corporativa actual. Montajes Segovia se localiza en Madrid, con servicios generales de ignifugación sin especialidad inferida.

**Ignisvérica (3057)** y **Apagal (2893)** se confirman por primera vez en sus fichas existentes. Ignisvérica completa únicamente su web vacía con CIF del aviso corporativo; mantiene Carcaixent y coordenadas frente a la dirección comercial de Almussafes. Apagal incorpora puertas y cortinas cortafuegos. **Enesa Continental (5803)** ya estaba confirmada y amplía compartimentación y sellados. Las seis fichas trabajadas añaden cinco confirmaciones; no se crean empresas por marca o delegación.

**Lugo, Palencia y Segovia pasan de cero a una ficha confirmada** en nuestra base. **Zamora** sigue sin confirmadas; ZAT / Zamorana de Aislamientos queda pendiente de titular y ejecución actuales. Son recuentos por domicilio de ficha, no por territorio de servicio ni censo del mercado. Global Fire Ingeniería conserva su ficha 4358 sin nueva clasificación hasta atribuir el dominio con fuente fiscal primaria; AMS Madrid / ASM Andalucía sigue pendiente de identificar los operadores ejecutores.

La simulación no dejó ambigüedades; se generaron **seis auditorías** y repetir el lote devuelve `sin_cambios=6`. Las huellas de los campos protegidos, cuentas, CRM y recuentos de tareas/notas/contactos de las tres existentes se conservan, con la excepción expresa de completar la web vacía de Ignisvérica. Las **23.620** filas financieras se mantienen; las tres altas quedan fuera de perímetro y sin estado SABI. Pasan **11 tests** de pasiva/importador. La API de producción verifica seis CIF únicos en lite/full, sus seis fichas con fuentes, 16 combinaciones y exportación de **291** confirmadas.

### Corte histórico de la octava tanda

La octava tanda del 25/10 revisa **34 candidatas y fichas** y aplica **9 altas y 5 enriquecimientos**. El universo pasa de **5.871 a 5.880 empresas** y las confirmadas de PCI pasiva, de **274 a 286**. El [octavo lote](research/pasiva-validada-ampliacion6-2026-10-25.json) conserva identidad fiscal, ejecución, fuentes y coordenadas municipales; el [seguimiento de la octava tanda](research/pasiva-ampliacion6-seguimiento-2026-10-25.json) separa 14 fichas modificadas, 10 ya confirmadas sin escritura, 8 pendientes y 2 fabricantes sin instalación propia contrastada. Estos son resultados de esta tanda; no agotan los pendientes históricos.

Las nueve altas son Somonplak, Thermo Metal, Pinturas La Demanda, Incoga Norte / Aplicanor, Rial Santander, Aisla y Ahorra, Indupime, Carrasco Pintores bajo el NIF de su titular y Pryco Revestimientos. No existían por CIF/NIF, nombre o dominio en el universo previo. Aplicanor se atribuye a Incoga Norte mediante su aviso y un certificado de aplicador del fabricante; este último venció en julio de 2026 y se conserva como atribución histórica, sin calificación vigente.

SCI / Soluciones Contra Incendios (294), Seguprot (2465) y Samuel Martínez Arriero / Conesam (4078) se confirman por primera vez en sus fichas existentes. Acusfoc (5871) añade sellados y Berbelporcel (1855), reacción al fuego por barniz aplicado a revestimientos decorativos de madera. Conesam completa solo la web vacía: mantiene Argés, coordenadas, estado y demás campos frente a su ubicación comercial en Talavera/Pepino. No se crea una segunda empresa por la marca.

La búsqueda se dirige a las ocho provincias sin fichas confirmadas en el corte previo. **Huesca, Ourense, Soria y Teruel pasan de cero a una**; **Lugo, Palencia, Segovia y Zamora** siguen sin confirmadas en nuestra base. El seguimiento agrupa alias de provincia solo para analizar cobertura, sin cambiar datos de fichas. La ubicación de una empresa no equivale a su territorio de servicio, y el cero no prueba ausencia de empresas locales.

La simulación no dejó ambigüedades; se generaron **14 auditorías** y repetir el lote devuelve `sin_cambios=14`. Se preservan por huella los campos protegidos, cuentas, CRM y recuentos de tareas/notas/contactos de las cinco existentes, salvo la web vacía de Conesam expresamente completada. Las **23.620** filas financieras se conservan. Las nueve altas quedan fuera de perímetro y sin consulta SABI. La API de producción verifica 14 CIF/NIF únicos, sus 14 fichas con fuentes, 16 combinaciones y exportación de **286** confirmadas.

### Corte histórico de la séptima tanda

La séptima tanda del 25/10 aplica **5 altas y 4 enriquecimientos**, pasando de **5.866 a 5.871 empresas** y de **269 a 274 con PCI pasiva confirmada**. Se incorporan Mecosa, New-Totmatic, Therman, Veliol e Ignifugados Borja. Este último pendiente se resuelve bajo el NIF de su titular autónomo, sin inventar una sociedad y siguiendo el modelo que ya admite personas físicas en PCI activa. Las cinco altas no tenían coincidencia por CIF/NIF, nombre o dominio. El [séptimo lote](research/pasiva-validada-ampliacion5-2026-10-25.json) conserva identidad, ejecución y ubicación municipal; el [seguimiento de la séptima tanda](research/pasiva-ampliacion5-seguimiento-2026-10-25.json) documenta 24 decisiones por dominio y remite al antecedente para los casos no reconsultados.

Ignofoc (2191) añade compartimentación y puertas; Atenúa (5827), estructura y sellados; SIEF-2 (946), sellados; RSI Tenerife (5842), conductos. Las cuatro ya estaban confirmadas, por lo que nueve registros trabajados añaden cinco confirmaciones. Se preservan por huella todos sus campos ajenos a pasiva, cuentas, CRM y recuentos de tareas/notas/contactos; se conservan las **23.620** filas financieras. Se generan nueve auditorías y la repetición devuelve `sin_cambios=9`. Las altas quedan fuera de perímetro y sin estado SABI.

Alberto confirma continuar con los campos actuales de actividad, servicios y fuentes. Se retira la propuesta de extender la clasificación de especialización/oferta diversificada; sus metadatos de la sexta tanda quedan como histórico, sin continuación ni nuevo filtro. La información de tamaño y cuentas queda para una carga SABI específica.

### Corte histórico de la sexta tanda

La sexta tanda del 25/10 aplica **11 altas y 4 enriquecimientos**, pasando de **5.855 a 5.866 empresas** y de **257 a 269 con PCI pasiva confirmada**. Las altas cubren ocho comunidades y no existían por CIF, nombre ni dominio en el universo de partida. Se resuelven Sistemplac y Rogilcar y se amplía por puertas, sellados e ignifugado de madera. El [sexto lote](research/pasiva-validada-ampliacion4-2026-10-25.json) y el [seguimiento de la sexta tanda](research/pasiva-ampliacion4-seguimiento-2026-10-25.json) documentan evidencia, ubicación, casos no concluyentes y pendientes anteriores sin reconsulta.

Securitas Seguridad España (327) se confirma por primera vez; NTCI (1576), Diaterm Foc (5805) y Orsei (2622) amplían especialidades. Se conservan las huellas de los campos ajenos a pasiva, cuentas, CRM y recuentos de tareas/notas/contactos de las cuatro fichas, así como las 23.620 filas financieras. Las altas entran fuera de perímetro y sin estado SABI. La aplicación deja 15 auditorías; repetirla devuelve `sin_cambios=15` sin nuevas escrituras.

El lote conservó un perfil exploratorio de oferta en 15 filas: **3 con especialización declarada y 12 con oferta diversificada**. Nunca fue un campo de ficha. La propuesta de extenderlo queda retirada por la aclaración posterior de Alberto; se conserva únicamente como antecedente de investigación.

### Corte histórico de la quinta tanda

La quinta tanda del 25/10 aplica **13 altas y 5 enriquecimientos**, pasando de **5.842 a 5.855 empresas** y de **243 a 257 con PCI pasiva confirmada**. Las altas se reparten por siete comunidades y no existían por CIF, nombre o dominio en el universo de partida. Se resuelven Pladiser, Isaphone, Gusolin y La Plana del rastreo anterior. Los [detalles por entidad y fuentes](research/pasiva-validada-ampliacion3-2026-10-25.json) y el [seguimiento de la quinta tanda](research/pasiva-ampliacion3-seguimiento-2026-10-25.json) sustituyen esos pendientes concretos.

Sinelec (ficha 2346) se confirma por primera vez. Enesa Continental (5803), Igesur (5804), Procaval / Proyectos y Servicios Caval (5812) y Escadur / Ignaria (5853) amplían evidencia o servicios. Proyecta Verm e Ignisol se vinculan a Escadur por su CIF, sin duplicar su ficha. Por ello, 18 fichas trabajadas suman 14 confirmaciones. Sus campos ajenos a pasiva, cuentas, CRM y recuentos de tareas/notas/contactos conservan las mismas huellas. Las 13 altas quedan fuera de perímetro y sin estado SABI; se conservan 23.620 filas financieras. La aplicación deja 18 auditorías; repetirla devuelve `sin_cambios=18` sin nuevas escrituras.

### Corte histórico de la cuarta tanda

El corte de las 13:30 recogía 5.824 empresas y 222 con pasiva confirmada. La cuarta tanda aplica **18 altas y 4 enriquecimientos** en fichas existentes: Josmag, Firex y Tecresa Protección Pasiva pasan a confirmadas; Proinse, ya confirmada, amplía evidencia. Resultado: **5.842 empresas y 243 con PCI pasiva confirmada**. Las altas cubren 11 comunidades autónomas y tienen CIF primario y localización contrastada; una sola entidad agrupa los dominios alternativos de Lotor y Aislamientos San Felices.

Se resuelven La Instaladora, Vimat y Acusfoc del seguimiento anterior. Los campos ajenos a pasiva de las cuatro fichas anteriores, sus cuentas, CRM y recuentos de tareas/notas/contactos conservan la misma huella. Las 18 altas quedan fuera de perímetro y sin estado SABI; se conservan 23.620 filas financieras. La carga inicial deja 22 auditorías y un ajuste de redacción de evidencia de Vimat, una adicional. La repetición del lote final devuelve `sin_cambios=22` sin nuevas auditorías. El [seguimiento de la cuarta tanda](research/pasiva-ampliacion2-seguimiento-2026-10-24.json) y el [cuarto lote](research/pasiva-validada-ampliacion2-2026-10-24.json) documentan resultados, exclusiones y discrepancias pendientes.

### Corte histórico de la tercera tanda

El corte anterior del 24/10 recogía 5.791 empresas y 184 con pasiva confirmada. La tercera tanda incorpora **33 entidades con CIF primario y enriquece 5 fichas existentes**, alcanzando 222. Se completan las webs vacías de Blinders, Promatec e IPS Incendio y el domicilio/localización vacíos de esta última. La aplicación produce 38 auditorías; repetirla devuelve `sin_cambios=38` sin auditorías adicionales.

Se verificaron por huella los campos protegidos, cuentas, CRM y recuentos de relaciones de las cinco fichas existentes. No cambiaron fuera de los complementos vacíos expresamente documentados. Las altas entraron fuera de perímetro y sin estado SABI. Se consultaron 97 perfiles de CLÚSIC, 70 de AD’IP y 24 de AVACOI, además de búsquedas por las 17 comunidades: 223 dominios descubiertos, 199 sin confirmación previa por dominio y 87 con indicios. Estos recuentos describen cribado, no 223 sociedades ni un censo completo. El [seguimiento regional](research/pasiva-asociaciones-regiones-2026-10-24.json) conserva resultado, fuentes y ambigüedades por dominio. Las dos tandas previas (69 y 115 entidades) siguen documentadas como historia en [Protección pasiva](PROTECCION_PASIVA.md).

### Repetir el recuento

Ejecutar solo `SELECT` en el entorno que se desea documentar y registrar fecha, destino y código de referencia:

```sql
BEGIN TRANSACTION READ ONLY;
SELECT count(*) FROM "Empresa" WHERE NOT "esAnonima";
SELECT sector, count(*) FROM "Empresa"
  WHERE NOT "esAnonima" GROUP BY sector;
SELECT estado, count(*) FROM "Empresa"
  WHERE NOT "esAnonima" GROUP BY estado;
SELECT "proteccionPasiva", count(*) FROM "Empresa"
  WHERE NOT "esAnonima" GROUP BY "proteccionPasiva";
SELECT anio, count(*) FROM "Financiero" GROUP BY anio ORDER BY anio;
SELECT fuente, count(*) FROM "Financiero" GROUP BY fuente;
SELECT count(*) FROM "Empresa"
  WHERE NOT "esAnonima" AND "enPerimetro" AND (web IS NULL OR web = '');
SELECT count(*) FROM "Empresa"
  WHERE NOT "esAnonima" AND lat IS NOT NULL AND lng IS NOT NULL;
SELECT migration_name, finished_at FROM _prisma_migrations
  WHERE rolled_back_at IS NULL ORDER BY migration_name;
ROLLBACK;
```

## Código y verificación

Versiones declaradas: Next.js 15.5.18, React/React DOM 19.2.4, Prisma 5.22, NextAuth 4.24 y Vercel AI SDK 6. El lockfile define las versiones exactas instalables. La CI usa Node.js 24 y PostgreSQL 16 temporal.

- Implementación de #192 (23/10): **700 tests correctos, 60 archivos, cero fallos**, typecheck de aplicación/importador y build correctos; aviso de lint preexistente en `policia/parse-empresas.ts`.
- Segunda tanda (24/10, datos y documentación): **11 tests de pasiva/importador correctos**, simulación sin ambigüedades, aplicación auditada y repetición sin cambios. Sin modificación del código de aplicación ni del esquema.
- Tercera tanda: **11 tests de pasiva/importador correctos**, 33 altas y 5 enriquecimientos sin filas ambiguas, 38 auditorías y repetición aplicada sin cambios. Se preservan 23.620 filas financieras y los campos protegidos de las cinco fichas anteriores.
- Cuarta tanda: **11 tests de pasiva/importador correctos**, simulación de 18 altas y 4 enriquecimientos sin ambigüedades, aplicación auditada y repetición final `sin_cambios=22`. Huellas de campos protegidos y relaciones de las cuatro fichas conservadas; las 18 altas tienen fuente de investigación, coordenadas y estado SABI nulo.
- Quinta tanda: **11 tests de pasiva/importador correctos**, simulación de 13 altas y 5 enriquecimientos sin ambigüedades, 18 auditorías y repetición aplicada `sin_cambios=18`. Campos protegidos y relaciones de las cinco fichas conservados, con 23.620 filas financieras sin cambios. Sin modificación de código de aplicación ni del esquema.
- Sexta tanda: **11 tests de pasiva/importador correctos**, simulación de 11 altas y 4 enriquecimientos sin ambigüedades, 15 auditorías y repetición aplicada `sin_cambios=15`. Huellas de las cuatro fichas existentes y 23.620 filas financieras conservadas. Sin modificación de aplicación ni esquema.
- Séptima tanda: **11 tests de pasiva/importador correctos**, simulación sin ambigüedades, cinco altas y cuatro enriquecimientos aplicados con nueve auditorías. Repetición `sin_cambios=9`, campos protegidos y 23.620 filas financieras conservados. Sin cambios de aplicación o esquema.
- Novena tanda: **11 tests de pasiva/importador correctos**, tres altas y tres enriquecimientos sin ambigüedades; seis auditorías y repetición `sin_cambios=6`. Campos protegidos y financieros conservados, salvo web vacía de Ignisvérica completada. Sin cambios de aplicación o esquema.
- API de producción tras la novena tanda: **5.251** registros geográficos, **291** con pasiva, **seis CIF** únicos en lite/full, seis fichas con fuentes, 16 combinaciones, exportación de 291 y pipeline coherente; acceso anónimo 401. No comprueba el flujo de contraseña.
- Octava tanda (histórico): **11 tests de pasiva/importador correctos**, nueve altas y cinco enriquecimientos sin ambigüedades, 14 auditorías y repetición `sin_cambios=14`. Campos protegidos y financieros conservados, con web vacía de Conesam completada de forma expresa. Sin cambios de aplicación o esquema.
- API de producción tras la octava tanda (histórico): **5.248** registros geográficos, **286** con pasiva, **14 CIF/NIF** únicos en lite/full, 14 fichas con fuentes, 16 combinaciones, exportación de 286 y conteos coherentes de pipeline; acceso anónimo 401. No comprueba el flujo de contraseña.
- API de producción tras la séptima tanda (histórico): **5.239** registros geográficos, **274** con pasiva, los **9 CIF/NIF** exactamente una vez en lite/full, nueve fichas con fuentes, 16 combinaciones, exportación de 274 y conteos de pipeline coherentes; acceso anónimo 401. La comprobación no valida el flujo de contraseña.
- API de producción tras la sexta tanda (histórico): **5.234** registros geográficos, **269** con pasiva, los **15 CIF** del lote exactamente una vez en lite/full, sus 15 fichas con fuentes, 16 combinaciones de actividades y exportación coherente. Conteos de pipeline verificados; acceso anónimo 401. La comprobación no valida el flujo de contraseña.
- API de producción tras la quinta tanda: **5.223** registros geográficos, **257** con pasiva, los **18 CIF** del lote exactamente una vez en lite/full, sus 18 fichas y exportación con fuentes y actividades coherentes. Se verifican 16 combinaciones selección/modo y conteos del pipeline; acceso anónimo 401. La comprobación no valida el flujo de contraseña.
- API de producción tras la cuarta tanda: **5.210** registros geográficos, **243** con pasiva, los **22 CIF** del lote exactamente una vez en lite/full, 22 fichas y exportación con actividades coherentes. Se verifican 16 combinaciones selección/modo y los conteos de pipeline contra consulta de solo lectura; acceso anónimo 401. La comprobación no valida el flujo de contraseña.
- Filtro de actividades: **713 tests correctos en 63 archivos**, TypeScript y build locales correctos. Las pruebas cubren todas las combinaciones de las tres actividades, ambas modalidades, exclusión de activa en altas de pasiva sin RIPCI, consistencia de lite/full/ficha/exportación y filtrado/conteos de pipeline. Sin migración ni nuevas escrituras de datos.
- Verificación histórica de APIs en #195, antes de la cuarta tanda: 5.192 registros, 16 combinaciones coherentes, 22 con las tres actividades, 160 con activa y pasiva y 222 con pasiva. Fichas de Plasfoc, Naes, IPS, Sella2, Técnicas de Refractarios y Project TGN y exportación coherentes; acceso anónimo 401.
- Verificación visual de #195, antes de la cuarta tanda: 22 con las tres, 160 con activa y pasiva, 222 con pasiva y 5.192 al elegir cualquiera de las tres. Controles y resultados revisados en 375 px, 768 px y escritorio; sin desbordamiento del nuevo control. La tabla completa conserva su desplazamiento horizontal en tablet. #196 verifica en esos tamaños la posición y el color de «Limpiar» junto a Actividades y que no borre la provincia. La cuarta tanda modifica datos/documentación, sin cambios de UI.
- API de producción de la tercera tanda: lite/full y exportación con **222** de pasiva y los 38 CIF exactamente una vez; fichas de Plasfoc, Naes, Blinders, IPS Incendio, Gestiplac, Brapesa Canarias, Sella2, Técnicas de Refractarios, Escadur y Project TGN verificadas. Es una comprobación histórica, anterior al recuento actual de 291.
- La CI del repositorio aplica migraciones, compara el esquema y ejecuta tests, typecheck y build; su resultado y el despliegue se enlazan desde la PR de esta entrega.
- Repositorio público en este corte. La confidencialidad de los datos depende de la autenticación y permisos de la aplicación.

## Entregas recientes

| Fecha | Entrega | Evidencia |
|---|---|---|
| 25/10/2026 | 35 casos y 16 fichas sin web revisados: 3 altas y 3 enriquecimientos; Metálicas Arranz resuelto y 291 confirmadas. Lugo, Palencia y Segovia incorporan su primera ficha confirmada | [Noveno lote](research/pasiva-validada-ampliacion7-2026-10-25.json), [seguimiento y cobertura](research/pasiva-ampliacion7-seguimiento-2026-10-25.json) |
| 25/10/2026 | Revisión dirigida por huecos provinciales: 34 candidatas/fichas, 9 altas, 5 enriquecimientos; Aplicanor y Conesam resueltos, 286 confirmadas | [Octavo lote](research/pasiva-validada-ampliacion6-2026-10-25.json), [seguimiento y cobertura](research/pasiva-ampliacion6-seguimiento-2026-10-25.json) |
| 25/10/2026 | Quinta ampliación asociativa/regional: 5 altas y 4 enriquecimientos dentro del modelo actual; Borja resuelto y 274 confirmadas acumuladas | [Séptimo lote](research/pasiva-validada-ampliacion5-2026-10-25.json), [seguimiento de la séptima tanda](research/pasiva-ampliacion5-seguimiento-2026-10-25.json) |
| 25/10/2026 | Cuarta ampliación asociativa/regional: 11 altas, 4 enriquecimientos y primeros perfiles de oferta; 269 confirmadas acumuladas | [Sexto lote](research/pasiva-validada-ampliacion4-2026-10-25.json), [seguimiento de la sexta tanda](research/pasiva-ampliacion4-seguimiento-2026-10-25.json) |
| 25/10/2026 | Tercera ampliación asociativa/regional: 13 altas en 7 comunidades y 5 enriquecimientos; 257 confirmadas acumuladas | [Quinto lote](research/pasiva-validada-ampliacion3-2026-10-25.json), [seguimiento de la quinta tanda](research/pasiva-ampliacion3-seguimiento-2026-10-25.json) |
| 24/10/2026 | Segunda ampliación asociativa/regional: 18 altas en 11 comunidades y 4 enriquecimientos; 243 confirmadas acumuladas | [Cuarto lote](research/pasiva-validada-ampliacion2-2026-10-24.json), [seguimiento de la cuarta tanda](research/pasiva-ampliacion2-seguimiento-2026-10-24.json) |
| 24/10/2026 | Actividades combinables PCI activa, PCI pasiva y seguridad electrónica, con todas/cualquiera; sustituye el filtro «Mixto» | [Criterio y flujo](ACTIVIDADES.md), sin reclasificación del universo |
| 24/10/2026 | Asociaciones y búsqueda por las 17 comunidades: 33 altas y 5 enriquecimientos aplicados; 222 confirmadas acumuladas | [Seguimiento regional](research/pasiva-asociaciones-regiones-2026-10-24.json), [tercer lote](research/pasiva-validada-regional-2026-10-24.json) |
| 24/10/2026 | 84 candidatas pendientes revisadas, barrido de 3.184 dominios y segundo lote aplicado: 106 enriquecimientos y 9 altas | [#193](https://github.com/albertofontiber/war-room/pull/193), [seguimiento](research/pasiva-seguimiento-2026-10-24.json), [lote](research/pasiva-validada-2026-10-24.json) |
| 23/10/2026 | Pasiva transversal, filtro/distintivo/fuentes, API/exportación/chat e importador auditado; primer lote ampliado aplicado | [#192](https://github.com/albertofontiber/war-room/pull/192), [implementación y lote](PROTECCION_PASIVA.md) |
| 23/10/2026 | Documentación contrastada y primera investigación de pasiva | [#191](https://github.com/albertofontiber/war-room/pull/191), fusionada |
| 23/10/2026 | Estado SABI, financieros 2025, homogeneización de ingresos, avisos y filtros de estado | [#190](https://github.com/albertofontiber/war-room/pull/190) |
| 15/10/2026 | Emails de acceso con la marca de las pantallas de login | [#189](https://github.com/albertofontiber/war-room/pull/189) |
| 15/10/2026 | Comprador BORME sin cortar por formas jurídicas y alias de Attlon | [#188](https://github.com/albertofontiber/war-room/pull/188) |
| 15/10/2026 | Rol de lectura del chat y búsqueda transversal con doce herramientas | [#187](https://github.com/albertofontiber/war-room/pull/187), [#186](https://github.com/albertofontiber/war-room/pull/186) |
| 14/10/2026 | Gestión de usuarios en BD, invitaciones, Mi cuenta y marca Fontiber en accesos | [#182](https://github.com/albertofontiber/war-room/pull/182), [#184](https://github.com/albertofontiber/war-room/pull/184), [#183](https://github.com/albertofontiber/war-room/pull/183), [#185](https://github.com/albertofontiber/war-room/pull/185) |
| Agosto–septiembre 2026 | RIPCI, habilitaciones, áreas Cepreven, sincronización conjunta de registros y mejoras de tareas/navegación | [#167](https://github.com/albertofontiber/war-room/pull/167)–[#181](https://github.com/albertofontiber/war-room/pull/181) |

## Criterio de mantenimiento

Actualizar este corte cuando cambien datos o comprobaciones relevantes. El código y las PR son la referencia para funcionalidades; la base, para recuentos; [Roadmap](ROADMAP.md), para trabajo abierto. Las antiguas cifras y listas se conservan en Git como historial, no como estado actual.
