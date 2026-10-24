# Protección pasiva: actividad transversal y ampliación del universo

Revisión: **24/10/2026**. Alcance: instaladoras y aplicadoras en España, incluidas las empresas existentes que también hacen pasiva. La actividad transversal y dos lotes están aplicados en producción: **184 sociedades con pasiva confirmada**.

## Resultado aplicado

El segundo lote incorpora **115 sociedades: 106 enriquecimientos y 9 altas**, adicionales a las 69 del 23/10. La simulación no dejó filas ambiguas. La aplicación inicial generó 115 auditorías y el complemento de localización de Extinhouse Group, una más. Repetir el lote final produce `sin_cambios=115`. Se comprobaron por huella los campos protegidos, las cuentas, el CRM y los recuentos de relaciones de las fichas existentes: permanecieron intactos, salvo los datos vacíos de identidad/localización expresamente completados.

El [lote del 24/10](research/pasiva-validada-2026-10-24.json) conserva CIF, fuente de identidad, servicios observados, evidencia de actividad y fecha. El [seguimiento actualizado](research/pasiva-seguimiento-2026-10-24.json) registra el resultado de las 84 candidatas pendientes y de los 98 dominios adicionales con indicios revisados. El [lote de 69 del 23/10](research/pasiva-validada-2026-10-23.json), su [seguimiento](research/pasiva-seguimiento-2026-10-23.json) y el [antecedente inicial de 21](research/proteccion-pasiva-2026-10-23.json) son instantáneas históricas; sus pendientes resueltos no representan el estado actual.

El barrido del 24/10 intentó **3.184 dominios**: las candidatas pendientes y los dominios disponibles de empresas del universo sin clasificación positiva. Recuperó contenido en 2.519 y no obtuvo contenido útil en 665. Los indicios se revisaron con páginas adicionales de servicios e identidad; una palabra en el menú o un artículo del blog no validan ejecución propia. De las 84 candidatas pendientes, 28 dieron lugar a enriquecimientos y 9 a altas. Las otras 47 tienen ahora un motivo concreto: 10 pendientes de identidad, 5 ambiguas, 13 sin acceso útil, 13 sin actividad acreditada y 6 fuera del alcance.

Estos números describen cobertura de investigación, no el tamaño del mercado. La base inicial tenía 2.440 sociedades sin web; dos titulares se resolvieron por su marca y CIF, pero el barrido de dominios no valida las demás. Tampoco la ausencia de indicios descarta actividad. El censo y las fuentes regionales siguen siendo parciales.

### Enriquecimientos

Plasfoc (`A43708106`, ficha 569) y Naes 2014 (`B87167011`, ficha 1788) conservan sus fichas. Armero se resolvió por el CIF de su aviso legal (`B54917844`, ficha 5624): se completaron su web, domicilio de Ibi y coordenadas municipales, que estaban vacíos y lo excluían de las listas geográficas. Se conservaron la provincia, comunidad, fuente, estado y perímetro existentes. También se incorporó evidencia para Iberext, Pefipresa, Prefire, Aicon, Fuegodiez, Berbel Porcel, TRIA, BCN & SOS, Ignofoc, Abtex, Cottés, Chacarrex, Vilahexdoss y otras instaladoras del lote.

La segunda tanda añade, entre otras, Eurofesa, Segurifoc, Profuego, Prodein, SIC24, Segufoc, Sidextin, Tecnifire ASO, Alarcín, Exb, Grupo Coyma y Tubsnet. Se resolvieron los casos de Auxcom 98 mediante su privacidad fiscal, Tecasem a favor de **TECASEM DLMS** y Acciona a favor de **Acciona Facility Services**, mediante contratación pública. No se atribuye la actividad a las otras sociedades del mismo dominio o grupo.

**Extinhouse Group** (`B24755019`, ficha 5503) y **PCI Tudemana 2021** (`B02908523`, ficha 2505) ya existían sin web. Se completó la web de ambas y el domicilio/localización vacíos de Extinhouse Group; la ficha pasa a aparecer en las listas geográficas. Se conservaron provincia y comunidad ya presentes. Las antiguas Extinhouse CB y Tu Demana SL no recibieron esa actividad por compartir marca. Las redirecciones de Biosca a Gefisa, Empyros a Eurofesa y Euroextin a Incotex tampoco transfieren actividad a las fichas antiguas.

Una coincidencia por dominio único ya vinculado a un CIF del universo puede justificar revisar la actividad de esa ficha; no equivale a haber obtenido el CIF en el aviso legal. El lote lo distingue mediante `identidadMetodo=universo_cif_dominio`. Ese método nunca permite crear una empresa nueva.

### Altas

**24/10: nueve altas.** Aistepol, Intropol, Terpolar Aillaments, Aislamientos Vascos Isovas, Martínez Franco Ingeniería y Técnicas de Protección Pasiva, Apolinar Cócera / Passivhaus Cuenca, Aterki Isola, Aislamientos Euna y Perfilea. Para Perfilea se contrastó la oferta de montaje incluido; para Aterki y Apolinar Cócera, la etiqueta expresa de protección pasiva del directorio de instaladores AISLA, sin confundir construcción de casas pasivas con protección contra incendios.

**23/10: diecinueve altas.** Control Ignífugo / CISA, Teprosol, Ignifugaciones Ibéricas, Engineering Propacon, Aplicaciones Apisur, Diaterm Foc, Ignitor Productos Ignífugos, Aislamos, Apliyes, APL Levante, Igesur Soluciones Técnicas, Proyectos y Servicios Caval, Protecciones Ignífugas del Centro, Enesa Continental, Aistercom, Vyapec, Revestimientos Valdoviño, Tenalba OP 3 y S'Euballo.

Cada alta tiene CIF en fuente fiscal primaria y localización contrastada. Para Euna se cruzó un documento municipal histórico de identidad con la web corporativa actual y el domicilio publicado en BORME; no se infiere su vigencia legal. Para Enesa se empleó su documento corporativo de calidad; para PIC, su aviso legal en PDF. No se usaron fichas secundarias para suplir una identidad fiscal ausente. Las coordenadas corresponden al **centro del municipio**, no a una geolocalización exacta del domicilio; los lotes conservan procedencia y precisión.

Las altas usan `sector=PCI`, `fuente=investigacion_pasiva_202610`, `enPerimetro=false` y `estado=null`. Son empresas incorporadas al universo, pendientes de evaluación de inversión y consulta SABI. Para verlas junto con las de perímetro, seleccionar **Perímetro → Todos**. La evidencia comercial no acredita estado legal activo, independencia, tamaño ni porcentaje de ingresos en pasiva.

## Modelo y aplicación

| Campo de `Empresa` | Significado |
|---|---|
| `proteccionPasiva` | `true`: actividad confirmada; `false`: revisión negativa explícita; `null`: sin revisar |
| `pasivaServicios` | Servicios observados: estructura, compartimentación, sellados, reacción al fuego, puertas/cortinas y conductos |
| `pasivaEvidencias` | Fuentes con URL, tipo, fecha y descripción; no incluye contactos personales |
| `pasivaRevisadaAt` | Fecha de la revisión conservada |

Pasiva es una actividad transversal. No modifica los sectores `PCI`, `seguridad_electronica` o `mixto`; este último sigue significando PCI y seguridad electrónica. Una misma empresa de activa y pasiva conserva un solo CIF y una sola ficha.

- Filtro multiselección de pasiva compartido por mapa y tabla; combina con sector, perímetro y otros filtros.
- Distintivo en tabla y tooltip del mapa. La ficha muestra estado, servicios, revisión y fuentes desplegables.
- Excel de la tabla: estado de pasiva, servicios, fecha y enlaces de evidencia, además del histórico financiero existente.
- API de listas: clasificación; API de ficha y exportación: detalle de evidencia. El esquema del chat y su buscador conocen los campos.
- No se marca como negativa a una empresa por falta de mención o por una web inaccesible. No se ha aplicado ninguna revisión negativa. Una revisión no concluyente conserva `null` en la ficha y su resultado fechado en el seguimiento.
- La clasificación se carga mediante el importador revisado; no hay editor manual de evidencias en la ficha ni cron de búsqueda web continua.

La migración aditiva `20261023140000_proteccion_pasiva` está aplicada antes del despliegue del código que lee las columnas. No crea tablas ni cambia permisos. El importador simula por defecto y escribe en una transacción con auditoría; ver [Operación](OPERATIONS.md).

## Fuentes y nivel de evidencia

| Fuente | Uso y límites |
|---|---|
| [Tecnifuego: comité de instalación de pasiva](https://www.tecnifuego.org/asociados-y-comites/comite-sectorial-de-ingenieria-instalacion-y-mantenimiento-de-sistemas-de) | Descubrimiento especializado y evidencia sectorial para miembros del comité de instalación; revisar rol e identidad. No es una calificación. |
| [AISLA: buscador de instaladores](https://www.aisla.org/instaladores/) | Se revisaron las tarjetas etiquetadas con servicio de protección pasiva. No se atribuye esa actividad a todos los instaladores de aislamiento. |
| [Calificación Cepreven](https://www.calificacioncepreven.com/Descarga-Documentos.html) | Áreas de instalación de pasiva. Para Fuegodiez se conservaron como evidencia los códigos ya guardados; el lote no renueva su vigencia. |
| Web corporativa | Servicios ejecutados y aplicaciones propias; avisos legales, privacidad o documentación corporativa para identidad. Diferenciar instalación de suministro. |
| [Aragón Empresa](https://aragonempresa.com/empresas-sello-rsa/imprimir.php?idencuesta=6&idusuario=3231) | Identidad fiscal de Naes. Un certificado histórico encontrado con vencimiento en 2025 no se utiliza como certificación vigente. |

Las evidencias se tipifican como `web_corporativa`, `asociacion` o `calificacion`; ninguna se convierte automáticamente en RIPCI, habilitación administrativa o calificación Cepreven. Los códigos Cepreven `PAS-COMP`, `PAS-REAC` y `PAS-ESTR` siguen en su campo propio. No se ha localizado en esta investigación un censo oficial exhaustivo de aplicadoras de pasiva; eso no prueba la inexistencia de cualquier registro local o parcial.

## Casos abiertos y continuidad

| Caso | Revisión necesaria antes de escribir |
|---|---|
| Goextín | El CIF publicado en web difiere del guardado en el universo. |
| Systemfire / Extintors Dídac | Confirmar continuidad fiscal tras la redirección a otro dominio. |
| LCHPRO / Aislamientos La Mancha | El aviso publica un CIF de agencia web; no dar de alta esa agencia como aplicadora. |
| Aiscasa | Web con contenido ajeno a la empresa; resolver identidad con otra fuente fiscal primaria. |
| Seguretat Arsol | Dos CIF comparten dominio; el aviso identifica el nombre sin publicar el CIF. |
| Sabico Contra Incendios | Identificar la sociedad ejecutora, sin atribuir la actividad a la cabecera por marca. |
| Dominios compartidos y redirecciones | Emacs, Starfoc y las redirecciones a Gefisa, Eurofesa e Incotex requieren atribución por sociedad. |
| Resto del seguimiento | Identidad o ejecución pendientes, webs sin acceso o evidencia insuficiente, con motivo y URLs fechadas por candidata. |

Carboline y KaviDoors quedan fuera de este lote por su rol de fabricante sin instalación propia validada; Intertek por ensayos/certificación y Cepreven por ser asociación. No se crean fichas por marca, delegación o landing de ciudad.

La siguiente ampliación puede continuar por territorio, servicios y asociaciones: [CLÚSIC](https://clusterincendis.com/socis/), [AD'IP](https://www.adip-as.com/), fabricantes con redes de aplicadores y búsqueda regional en castellano y lenguas locales. Las 184 confirmadas no agotan el mercado. Para el universo actual quedan las sociedades sin web, los accesos fallidos y las atribuciones no resueltas; el primer barrido general de dominios ya está realizado.

Para cada nueva tanda: validar actividad e identidad, cruzar CIF exacto, resolver dominios compartidos, simular, aplicar únicamente las filas validadas y verificar idempotencia. Los enriquecimientos no alteran perímetro, responsable, etapa, financieros, grupo o fuente original. Una empresa pendiente permanece `null`, nunca se transforma por defecto en «no hace pasiva».
