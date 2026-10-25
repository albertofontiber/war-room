# Estado actual del proyecto

Corte: **25 de octubre de 2026, Europe/Madrid**. Base de código: [#197](https://github.com/albertofontiber/war-room/pull/197), fusionada en `4cae40b`. Datos: quinto lote de pasiva aplicado y verificado en producción. Es una instantánea fechada, no un contador en vivo.

## Datos comprobados

Consulta a la base configurada para producción mediante Prisma dentro de una transacción `READ ONLY`, después de aplicar el lote de pasiva. Las altas y enriquecimientos previos se auditaron por separado; el recuento no realizó escrituras.

| Métrica | Resultado | Definición |
|---|---:|---|
| Empresas del universo | 5.855 | `Empresa` con `esAnonima=false` |
| Sector PCI | 4.617 | Valor `PCI` |
| Seguridad electrónica | 770 | Valor `seguridad_electronica` |
| Mixtas | 468 | PCI y seguridad electrónica; no significa activa y pasiva |
| Pasiva confirmada | 257 | `proteccionPasiva=true`; cobertura parcial, no censo del mercado |
| Actividad PCI activa | 4.994 | Universo PCI/mixto previo y categorías RIPCI válidas; excluye altas de investigación pasiva sin evidencia de activa |
| Actividad seguridad electrónica | 1.238 | Sectores `seguridad_electronica` o `mixto` |
| PCI activa y PCI pasiva | 164 | Ambas actividades; pueden prestar también seguridad electrónica |
| Las tres actividades | 23 | PCI activa, PCI pasiva y seguridad electrónica |
| Solo PCI pasiva acreditada | 92 | Lista de actividades con únicamente pasiva; no constituye revisión negativa de las otras actividades |
| Años de cuentas | 23.620 | Filas de `Financiero`; no número de empresas |
| Cuentas del ejercicio 2025 | 2.725 | Filas con `anio=2025`, todas las fuentes |
| Años de cuentas de la extracción SABI de octubre | 15.766 | Filas con `fuente=sabi_2610` |
| Empresas con web no nula | 3.420 | El dato no acredita que todas las webs funcionen o estén validadas |
| En perímetro sin web | 1.492 | `enPerimetro=true`, web nula o vacía y no anónima |
| Empresas con coordenadas en las API de mapa/tabla | 5.223 | Las listas geográficas excluyen coordenadas nulas; no es el total del universo |
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
| Sin consultar | 92 |

El total de estados coincide con el universo del corte. No encontrada en SABI no implica inactividad. Las altas de pasiva conservan `estado=null` hasta una consulta SABI; no se han clasificado como activas por su web. Las métricas de actividad se solapan y no deben sumarse como sectores excluyentes. Su [criterio compartido](ACTIVIDADES.md) incorpora la aclaración de Alberto del 24/10 sobre PCI activa en el universo previo.

Las diez migraciones versionadas hasta `20261023140000_proteccion_pasiva` constan aplicadas, sin pendientes. La presencia de estados y filas `sabi_2610` acredita la carga de octubre en la base.

### Cambio respecto al corte anterior

La quinta tanda del 25/10 aplica **13 altas y 5 enriquecimientos**, pasando de **5.842 a 5.855 empresas** y de **243 a 257 con PCI pasiva confirmada**. Las altas se reparten por siete comunidades y no existían por CIF, nombre o dominio en el universo de partida. Se resuelven Pladiser, Isaphone, Gusolin y La Plana del rastreo anterior. Los [detalles por entidad y fuentes](research/pasiva-validada-ampliacion3-2026-10-25.json) y el [seguimiento vigente](research/pasiva-ampliacion3-seguimiento-2026-10-25.json) sustituyen esos pendientes concretos.

Sinelec (ficha 2346) se confirma por primera vez. Enesa Continental (5803), Igesur (5804), Procaval / Proyectos y Servicios Caval (5812) y Escadur / Ignaria (5853) amplían evidencia o servicios. Proyecta Verm e Ignisol se vinculan a Escadur por su CIF, sin duplicar su ficha. Por ello, 18 fichas trabajadas suman 14 confirmaciones. Sus campos ajenos a pasiva, cuentas, CRM y recuentos de tareas/notas/contactos conservan las mismas huellas. Las 13 altas quedan fuera de perímetro y sin estado SABI; se conservan 23.620 filas financieras. La aplicación deja 18 auditorías; repetirla devuelve `sin_cambios=18` sin nuevas escrituras.

### Corte histórico de la cuarta tanda

El corte de las 13:30 recogía 5.824 empresas y 222 con pasiva confirmada. La cuarta tanda aplica **18 altas y 4 enriquecimientos** en fichas existentes: Josmag, Firex y Tecresa Protección Pasiva pasan a confirmadas; Proinse, ya confirmada, amplía evidencia. Resultado: **5.842 empresas y 243 con PCI pasiva confirmada**. Las altas cubren 11 comunidades autónomas y tienen CIF primario y localización contrastada; una sola entidad agrupa los dominios alternativos de Lotor y Aislamientos San Felices.

Se resuelven La Instaladora, Vimat y Acusfoc del seguimiento anterior. Los campos ajenos a pasiva de las cuatro fichas anteriores, sus cuentas, CRM y recuentos de tareas/notas/contactos conservan la misma huella. Las 18 altas quedan fuera de perímetro y sin estado SABI; se conservan 23.620 filas financieras. La carga inicial deja 22 auditorías y un ajuste de redacción de evidencia de Vimat, una adicional. La repetición del lote final devuelve `sin_cambios=22` sin nuevas auditorías. El [seguimiento actual](research/pasiva-ampliacion2-seguimiento-2026-10-24.json) y el [cuarto lote](research/pasiva-validada-ampliacion2-2026-10-24.json) documentan resultados, exclusiones y discrepancias pendientes.

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
- API de producción tras la quinta tanda: **5.223** registros geográficos, **257** con pasiva, los **18 CIF** del lote exactamente una vez en lite/full, sus 18 fichas y exportación con fuentes y actividades coherentes. Se verifican 16 combinaciones selección/modo y conteos del pipeline; acceso anónimo 401. La comprobación no valida el flujo de contraseña.
- API de producción tras la cuarta tanda: **5.210** registros geográficos, **243** con pasiva, los **22 CIF** del lote exactamente una vez en lite/full, 22 fichas y exportación con actividades coherentes. Se verifican 16 combinaciones selección/modo y los conteos de pipeline contra consulta de solo lectura; acceso anónimo 401. La comprobación no valida el flujo de contraseña.
- Filtro de actividades: **713 tests correctos en 63 archivos**, TypeScript y build locales correctos. Las pruebas cubren todas las combinaciones de las tres actividades, ambas modalidades, exclusión de activa en altas de pasiva sin RIPCI, consistencia de lite/full/ficha/exportación y filtrado/conteos de pipeline. Sin migración ni nuevas escrituras de datos.
- Verificación histórica de APIs en #195, antes de la cuarta tanda: 5.192 registros, 16 combinaciones coherentes, 22 con las tres actividades, 160 con activa y pasiva y 222 con pasiva. Fichas de Plasfoc, Naes, IPS, Sella2, Técnicas de Refractarios y Project TGN y exportación coherentes; acceso anónimo 401.
- Verificación visual de #195, antes de la cuarta tanda: 22 con las tres, 160 con activa y pasiva, 222 con pasiva y 5.192 al elegir cualquiera de las tres. Controles y resultados revisados en 375 px, 768 px y escritorio; sin desbordamiento del nuevo control. La tabla completa conserva su desplazamiento horizontal en tablet. #196 verifica en esos tamaños la posición y el color de «Limpiar» junto a Actividades y que no borre la provincia. La cuarta tanda modifica datos/documentación, sin cambios de UI.
- API de producción de la tercera tanda: lite/full y exportación con **222** de pasiva y los 38 CIF exactamente una vez; fichas de Plasfoc, Naes, Blinders, IPS Incendio, Gestiplac, Brapesa Canarias, Sella2, Técnicas de Refractarios, Escadur y Project TGN verificadas. Es una comprobación histórica, anterior al recuento actual de 257.
- La CI del repositorio aplica migraciones, compara el esquema y ejecuta tests, typecheck y build; su resultado y el despliegue se enlazan desde la PR de esta entrega.
- Repositorio público en este corte. La confidencialidad de los datos depende de la autenticación y permisos de la aplicación.

## Entregas recientes

| Fecha | Entrega | Evidencia |
|---|---|---|
| 25/10/2026 | Tercera ampliación asociativa/regional: 13 altas en 7 comunidades y 5 enriquecimientos; 257 confirmadas acumuladas | [Quinto lote](research/pasiva-validada-ampliacion3-2026-10-25.json), [seguimiento vigente](research/pasiva-ampliacion3-seguimiento-2026-10-25.json) |
| 24/10/2026 | Segunda ampliación asociativa/regional: 18 altas en 11 comunidades y 4 enriquecimientos; 243 confirmadas acumuladas | [Cuarto lote](research/pasiva-validada-ampliacion2-2026-10-24.json), [seguimiento actual](research/pasiva-ampliacion2-seguimiento-2026-10-24.json) |
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
