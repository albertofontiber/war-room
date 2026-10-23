# Protección pasiva: actividad transversal y ampliación del universo

Revisión: **23/10/2026**. Alcance: instaladoras y aplicadoras en España, incluidas las empresas existentes que también hacen pasiva. La actividad está implementada y el primer lote ampliado está aplicado en producción.

## Resultado aplicado

Se han contrastado identidad y actividad de **69 empresas: 50 enriquecimientos y 19 altas**. La simulación aceptó las filas sin ambigüedades; repetir el lote con escritura produce `sin_cambios=69`. Cada modificación deja `AuditLog`, incluidas la ampliación de fuentes y la localización de Armero. Se comprobaron por huella los campos protegidos, las cuentas, el CRM y los recuentos de relaciones de las fichas existentes: permanecieron intactos.

El [lote validado](research/pasiva-validada-2026-10-23.json) conserva CIF, fuente de identidad, servicios observados, evidencia de actividad y fecha. El [seguimiento de candidatas](research/pasiva-seguimiento-2026-10-23.json) distingue las incorporadas, pendientes y excluidas del alcance. El [lote inicial de 21](research/proteccion-pasiva-2026-10-23.json) se conserva como antecedente fechado; sus antiguos pasos pendientes no representan el estado actual.

La investigación recorrió **156 dominios** de Tecnifuego, AISLA, la primera tanda y webs del universo existente. El seguimiento incorpora además S'Euballo: 157 dominios, que no equivalen necesariamente a 157 sociedades. Se han clasificado 69 empresas; quedan 72 dominios por revisar, siete con identidad fiscal pendiente y cinco con identidad ambigua; cuatro quedaron fuera del alcance. Estos números describen el trabajo realizado y no estiman el tamaño del mercado. Ni el universo ni los directorios se han revisado exhaustivamente.

### Enriquecimientos

Plasfoc (`A43708106`, ficha 569) y Naes 2014 (`B87167011`, ficha 1788) conservan sus fichas. Armero se resolvió por el CIF de su aviso legal (`B54917844`, ficha 5624): se completaron su web, domicilio de Ibi y coordenadas municipales, que estaban vacíos y lo excluían de las listas geográficas. Se conservaron la provincia, comunidad, fuente, estado y perímetro existentes. También se incorporó evidencia para Iberext, Pefipresa, Prefire, Aicon, Fuegodiez, Berbel Porcel, TRIA, BCN & SOS, Ignofoc, Abtex, Cottés, Chacarrex, Vilahexdoss y otras instaladoras del lote.

Una coincidencia por dominio único ya vinculado a un CIF del universo puede justificar revisar la actividad de esa ficha; no equivale a haber obtenido el CIF en el aviso legal. El lote lo distingue mediante `identidadMetodo=universo_cif_dominio`. Ese método nunca permite crear una empresa nueva.

### Altas

Control Ignífugo / CISA, Teprosol, Ignifugaciones Ibéricas, Engineering Propacon, Aplicaciones Apisur, Diaterm Foc, Ignitor Productos Ignífugos, Aislamos, Apliyes, APL Levante, Igesur Soluciones Técnicas, Proyectos y Servicios Caval, Protecciones Ignífugas del Centro, Enesa Continental, Aistercom, Vyapec, Revestimientos Valdoviño, Tenalba OP 3 y S'Euballo.

Cada alta tiene CIF publicado en fuente corporativa y una localización contrastada. Para Enesa se empleó su documento corporativo de calidad; para PIC, su aviso legal en PDF. No se usaron fichas secundarias para suplir una identidad fiscal ausente. Las coordenadas de las altas corresponden al **centro del municipio**, no a una geolocalización exacta del domicilio; el lote conserva procedencia y precisión.

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
- No se marca como negativa a una empresa por falta de mención o por una web inaccesible. No se ha aplicado ninguna revisión negativa en este lote.
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
| Ignitor Martínez Franco | Resolver la identidad en fuente primaria; no confundir con Ignitor Productos Ignífugos, ya incorporada por su propio CIF. |
| Auxcom 98 | El CIF publicado en web difiere del guardado en el universo. |
| Goextín | El CIF publicado en web difiere del guardado en el universo. |
| Tecasem | Dos sociedades del universo comparten dominio; separar titularidad y actividad. |
| Systemfire / Extintors Dídac | Confirmar continuidad fiscal tras la redirección a otro dominio. |
| Acciona | El CIF del dominio de grupo no resuelve la filial ejecutora. |
| Otras candidatas del seguimiento | Completar identidad, servicio propio y cruce. Un resultado automático de rastreo no valida una empresa. |

Carboline y KaviDoors quedan fuera de este lote por su rol de fabricante sin instalación propia validada; Intertek por ensayos/certificación y Cepreven por ser asociación. No se crean fichas por marca, delegación o landing de ciudad.

La siguiente ampliación debe continuar por territorio, servicios y asociaciones: [CLÚSIC](https://clusterincendis.com/socis/), [AD'IP](https://www.adip-as.com/), fabricantes con redes de aplicadores y búsqueda regional en castellano y lenguas locales. No limitar el trabajo a estas 69. Priorizar también las empresas del universo actual con pasiva todavía sin revisar.

Para cada nueva tanda: validar actividad e identidad, cruzar CIF exacto, resolver dominios compartidos, simular, aplicar únicamente las filas validadas y verificar idempotencia. Los enriquecimientos no alteran perímetro, responsable, etapa, financieros, grupo o fuente original. Una empresa pendiente permanece `null`, nunca se transforma por defecto en «no hace pasiva».
