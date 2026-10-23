# Protección pasiva: ampliación del universo

Investigación inicial y cruce de datos: **23/10/2026**. Alcance indicado por Alberto: **instaladoras y aplicadoras en España**, incluidas empresas existentes que también hacen pasiva. Fabricantes, distribuidores puros, laboratorios y consultoras sin instalación no forman parte de este lote de targets.

Este documento y el [lote estructurado](research/proteccion-pasiva-2026-10-23.json) son una investigación preparatoria. No se han dado de alta empresas, aplicado etiquetas ni cambiado perímetro, CRM o datos financieros de producción. La propuesta de modelo de la sección 5 aún no está implementada.

## 1. Conclusión operativa

Hay que trabajar en dos frentes: **identificar actividad de pasiva en las fichas actuales** y **descubrir entidades nuevas**. La ausencia de una marca de pasiva no prueba que una empresa no preste el servicio.

Plasfoc y Naes 2014 ilustran el primer caso: ambas están en la base y sus webs describen pasiva, pero no tienen áreas Cepreven de pasiva guardadas. Control Ignífugo ilustra el segundo: tiene identidad fiscal y actividad publicadas, y no aparece al buscar su CIF en el universo.

Una lista de asociados facilita descubrimiento, pero no es un censo de instaladoras ni un registro administrativo. En esta investigación no se ha localizado un censo oficial exhaustivo de aplicadoras de pasiva; esto no acredita la inexistencia de cualquier registro local, voluntario o parcial.

## 2. Fuentes y utilidad

| Prioridad | Fuente consultada | Uso | Comprobación adicional |
|---|---|---|---|
| 1 | [Tecnifuego: comité de instalación de pasiva](https://www.tecnifuego.org/asociados-y-comites/comite-sectorial-de-ingenieria-instalacion-y-mantenimiento-de-sistemas-de) | Semillas especializadas y enlace a la empresa | Separar instaladoras de fabricantes, ensayos y otras entidades presentes en el directorio |
| 1 | [Calificación Cepreven: listado vigente](https://www.calificacioncepreven.com/Descarga-Documentos.html) | Evidencia de áreas de instalación de pasiva | Comprobar edición y vigencia; calificación voluntaria no equivale a pertenencia a la asociación |
| 2 | [AISLA: buscador de instaladores](https://www.aisla.org/instaladores/) | Tiene filtro de protección pasiva y provincia | Evitar incorporar a todos los instaladores de aislamiento sin verificar actividad concreta |
| 2 | [CLÚSIC: socios](https://clusterincendis.com/socis/) | Cobertura de Cataluña y referencias sectoriales | Revisar fichas actuales; un catálogo antiguo solo da pistas |
| 2 | [AD’IP](https://www.adip-as.com/) | Sector de instaladores que incluye pasiva | Es una fuente más amplia; falta recorrer y validar su directorio en una siguiente tanda |
| 3 | Web corporativa y búsqueda geográfica | Encontrar especialistas no asociados y trabajos ejecutados | Identidad fiscal, servicio realmente instalado y deduplicación de marcas/landings |

[Cepreven explica](https://www.calificacioncepreven.com/Que-es.html) el carácter voluntario de su calificación. Las áreas `PAS-COMP`, `PAS-REAC` y `PAS-ESTR` ya están definidas en `src/lib/cepreven/areas.ts`. La sincronización actual cruza ese dato contra empresas existentes; no debe confundirse con un proceso general de alta de todas las instaladoras.

No se atribuye afiliación a todas las candidatas del lote: cada fila identifica su origen. AISLA, CLÚSIC y AD’IP son canales de expansión verificados o identificados; sus directorios todavía no se han recorrido exhaustivamente.

## 3. Primera tanda y cruce con el War Room

Lote de **21 candidatas**, no muestra representativa ni estimación del tamaño del mercado. Las fuentes y el estado por fila están en el JSON enlazado. Se revisó la oferta en web corporativa de 14; una adicional se apoya en áreas Cepreven guardadas, y seis son solo descubrimientos del comité pendientes de validar.

Se cruzó en lectura con las empresas no anónimas de producción: primero CIF conocido; si no había CIF, dominio exacto sin `www`; en un caso, nombre como pista. Resultado: **2 coincidencias por CIF, 8 por web, 1 por nombre y 10 sin coincidencia por el método disponible**. Una coincidencia web/nombre necesita confirmar entidad fiscal antes de escribir. Un resultado sin coincidencia y sin CIF no demuestra que sea una entidad nueva.

### Fichas existentes o posibles coincidencias

| Candidata | Ficha | Cruce | Evidencia de actividad y situación |
|---|---:|---|---|
| [Plasfoc](https://www.plasfoc.com/category/proteccion-pasiva-contra-incendios/) | 569 | CIF `A43708106` | Actividad revisada; enriquecer la misma ficha |
| [Naes 2014 / Naes PCI](https://naes2014.es/) | 1788 | CIF `B87167011` | Actividad revisada; conservar alias y revisar datos de sede sin sobrescribirlos automáticamente |
| [Los Montes](https://www.aislamientoslosmontes.com/) | 44 | Web | Instaladora de ignifugación; confirmar CIF de la web |
| [Rada Ignifugación](https://radaignifugacion.es/) | 196 | Web | Ofrece activa y pasiva; no confundir con otras empresas llamadas Rada |
| [Iberext](https://www.iberext.com/) | 467 | Web | Oferta de pasiva y áreas Cepreven ya guardadas |
| [Pefipresa](https://www.pefipresa.com/) | 446 | Web | Oferta de pasiva y áreas Cepreven ya guardadas |
| Fuegodiez | 2863 | Web | Áreas Cepreven guardadas; pendiente revisión de web corporativa en este lote |
| Berbel Porcel | 1855 | Web | Descubrimiento del comité; revisar prestación actual |
| Aicon | 1360 | Web | Descubrimiento del comité; revisar prestación actual |
| Prefire | 864 | Web | Descubrimiento del comité; revisar prestación actual |
| [Ignifugados Armero](https://ignifugadosarmero.com/ignifugaciones-bilbao/) | 5624 | Solo nombre | Servicio revisado, identidad de la web pendiente de casar con CIF |

El [aviso legal de Plasfoc](https://www.plasfoc.com/aviso-legal/) publica el CIF que coincide con la ficha. Para Naes, la [ficha de Aragón Empresa](https://aragonempresa.com/empresas-sello-rsa/imprimir.php?idencuesta=6&idusuario=3231) identifica la sociedad y su CIF. Un certificado histórico de Naes encontrado en su web expiraba en 2025: no se utiliza como prueba de una certificación vigente en 2026.

### Sin coincidencia

| Candidata | Identidad | Evidencia / revisión pendiente |
|---|---|---|
| [Control Ignífugo / CISA](https://www.controlignifugo.es/) | `A19199892`, [aviso legal](https://www.controlignifugo.es/aviso-legal/) | Instaladora/aplicadora; identidad y actividad revisadas |
| [Teprosol](https://teprosol.com/) | `B78670049`, [privacidad](https://teprosol.com/politica-de-privacidad/) | Instalación y aplicación; identidad y actividad revisadas |
| [Ignifugaciones Ibéricas](https://ignifugacionesibericas.com/empresa-de-ignifugaciones-y-aislamientos-en-sevilla/) | `B44668531`, documento corporativo enlazado en el lote | Actividad revisada; corroborar titularidad fiscal con aviso legal antes de alta |
| [Aplicaciones Apisur](https://aplicacionesapisur.com/ignifugaciones-sevilla/) | `B18777482`, pie legal corporativo | Actividad e identidad publicadas; validar sede fiscal frente a cobertura comercial |
| [Ignitor Productos Ignífugos](https://ignifugacionesignitor.com/quienes-somos/) | CIF pendiente | Aplicación propia además de suministro; resolver entidad |
| [Ignitor Martínez Franco](https://www.ignitor-martinezfranco.com/) | CIF pendiente | Instalación declarada; resolver entidad separadamente |
| [Propacon](https://propacon.com/) | CIF pendiente | Diseño y ejecución de pasiva; resolver titular |
| Diaterm Foc | CIF pendiente | Descubierta en comité; revisar web vigente y posible relación con grupo |
| Protecciones Ignífugas del Centro | CIF pendiente | Descubierta en comité; resolver entidad y servicios |
| Enesa Continental | CIF pendiente | Descubierta en comité; distinguir ejecución de suministro |

Control Ignífugo tiene sede publicada en Leganés y una oferta de protección estructural, compartimentación y sellados. Es una buena semilla de entidad candidata a alta; la valoración M&A, independencia, tamaño o porcentaje de ingresos en pasiva no se deducen de su web.

### Riesgos concretos de duplicación detectados

- Armero dispone de páginas para numerosas ciudades. Una página «Bilbao» no implica una sociedad ni sede nueva en Bizkaia.
- Naes aparece con denominaciones y dominios de marca diferentes; el CIF es el identificador para conservar una sola ficha.
- Dos webs utilizan la marca Ignitor con nombres jurídicos distintos. No se fusionan sin resolver los CIF.
- Las ubicaciones comerciales, talleres y domicilio fiscal se guardan como conceptos distintos. No corregir la provincia de una ficha a partir de una landing local.

## 4. Proceso de construcción del universo

1. **Revisar lo existente.** Empezar por las áreas Cepreven de pasiva y los ejemplos del usuario. Después buscar evidencia de pasiva en las webs actuales; nombres con «ignifug» o «aislamiento» son pistas, no condiciones de inclusión.
2. **Descubrir fuera de la base.** Recorrer los directorios especializados con fecha de consulta. Mantener fuera del lote de aplicadoras a fabricantes/distribuidores puros, asociaciones y ensayos.
3. **Ampliar cobertura.** Búsquedas por comunidad/provincia, en castellano y lenguas locales, combinando instalación/aplicación con ignifugación, pintura intumescente, mortero ignífugo, sellado de pasos, sectorización, compartimentación, portes tallafoc o protecció passiva. Incluir península e islas y medir cobertura por territorio.
4. **Validar actividad e identidad.** Servicio concreto ejecutado por la empresa, fuente corporativa o técnica identificable, razón social/CIF y domicilio. Mantener separada la verificación de actividad de la vigencia legal o de una certificación. No aceptar solo una ficha SEO o un footer con CIF de plantilla.
5. **Cruzar y revisar.** CIF exacto primero. Web/nombre/alias generan propuestas de match. Resolver dominios compartidos, grupos, cambios de denominación y duplicados antes de dar de alta.
6. **Simular incorporación.** Informe con altas, enriquecimientos, ambigüedades y excluidas, más campos que cambiarían. Confirmar que una segunda ejecución no duplicaría entidades ni evidencias.
7. **Incorporar y medir.** Escribir únicamente filas validadas bajo el modelo acordado, comprobar API/mapa/tabla/chat y registrar el lote y su auditoría. La búsqueda se amplía por tandas; nunca denominar «censo completo» a una lista sin prueba de cobertura.

Por cada candidata conservar: entidad, alias, CIF y fuente de identidad; URL/fecha/tipo de evidencia de actividad; servicios observados; territorio de sede y cobertura por separado; estado de validación; match propuesto/confirmado; motivo de exclusión o ambigüedad. No incorporar contactos personales encontrados incidentalmente.

## 5. Encaje propuesto en la aplicación

**Propuesta pendiente de implementación**, compatible con las tres categorías actuales de sector:

- Añadir una actividad transversal de protección pasiva con estado **confirmada / descartada tras revisión / sin revisar**. No usar ausencia de dato como «no hace pasiva».
- Conservar evidencia separada por fuente y fecha. Distinguir actividad declarada, trabajos observados y calificación vigente. Una asociación no otorga automáticamente una calificación.
- Desglosar, cuando haya evidencia, protección estructural, compartimentación/sellados y reacción al fuego; ampliar puertas/conductos según los servicios reales. No copiar códigos Cepreven a partir de una descripción comercial.
- Exponer filtro y distintivo de pasiva en mapa/tabla/ficha, y el atributo/evidencias en exportación y esquema del chat. Las empresas de activa y pasiva conservan una ficha.
- Reutilizar `sector=PCI` para nuevas empresas dedicadas a PCI, sin inventar que `mixto` significa activa+pasiva. Mantener los grupos y habilitaciones ya existentes.
- El enriquecimiento de una ficha no modifica perímetro, responsable, etapa, financieros o fuente original. Para altas nuevas, el criterio de perímetro se decide expresamente; `estado=null` hasta consultar SABI, no «no encontrada» o «activa» por inferencia.
- No añadir un cron de búsqueda web continua en esta fase. La siguiente entrega técnica debería cubrir primero un lote pequeño con simulación, revisión de matches y trazabilidad de altas/enriquecimientos.

## 6. Criterios de cierre de una primera incorporación

- Plasfoc y Naes se enriquecen por su CIF sin duplicarse; Control Ignífugo se resuelve como alta por su CIF si sigue ausente.
- Los matches de web/nombre se resuelven antes de escribir; los CIF desconocidos permanecen en investigación.
- «Sin revisar» permanece distinguible de «no presta el servicio».
- Filtros, ficha, exportación y chat leen la misma clasificación; la evidencia permite entender por qué se marcó.
- Migración e importación son reproducibles y verificadas; las altas conservan fuente y las fichas existentes, su operativa CRM.

La tanda actual cumple descubrimiento, evidencia inicial y propuesta de cruce. Quedan por ejecutar la revisión fiscal de los casos abiertos y la implementación/aplicación de la clasificación descrita; no se presentan como entregadas.
