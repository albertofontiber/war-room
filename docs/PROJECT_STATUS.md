# Estado actual del proyecto

Corte: **23 de octubre de 2026, 16:17 Europe/Madrid**. Base documental: [#191](https://github.com/albertofontiber/war-room/pull/191), fusionada en `d2d23d6`. Este corte incorpora la entrega de pasiva transversal y su lote aplicado. Es una instantánea fechada, no un contador en vivo.

## Datos comprobados

Consulta a la base configurada para producción mediante Prisma dentro de una transacción `READ ONLY`, después de aplicar el lote de pasiva. Las altas y enriquecimientos previos se auditaron por separado; el recuento no realizó escrituras.

| Métrica | Resultado | Definición |
|---|---:|---|
| Empresas del universo | 5.782 | `Empresa` con `esAnonima=false` |
| Sector PCI | 4.544 | Valor `PCI` |
| Seguridad electrónica | 770 | Valor `seguridad_electronica` |
| Mixtas | 468 | PCI y seguridad electrónica; no significa activa y pasiva |
| Pasiva confirmada | 69 | `proteccionPasiva=true`; cobertura parcial, no censo del mercado |
| Años de cuentas | 23.620 | Filas de `Financiero`; no número de empresas |
| Cuentas del ejercicio 2025 | 2.725 | Filas con `anio=2025`, todas las fuentes |
| Años de cuentas de la extracción SABI de octubre | 15.766 | Filas con `fuente=sabi_2610` |
| Empresas con web no nula | 3.342 | El dato no acredita que todas las webs funcionen o estén validadas |
| En perímetro sin web | 1.496 | `enPerimetro=true`, web nula o vacía y no anónima |
| Empresas con coordenadas en las API de mapa/tabla | 5.148 | Las listas geográficas excluyen coordenadas nulas; no es el total del universo |
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
| Sin consultar | 19 |

El total de estados coincide con el universo del corte. No encontrada en SABI no implica inactividad. Las altas de pasiva conservan `estado=null` hasta una consulta SABI; no se han clasificado como activas por su web.

Las diez migraciones versionadas hasta `20261023140000_proteccion_pasiva` constan aplicadas, sin pendientes. La presencia de estados y filas `sabi_2610` acredita la carga de octubre en la base.

### Cambio respecto al corte anterior

El corte de las 11:11 recogía 5.763 empresas. Se incorporaron 19 entidades con CIF verificado y se enriquecieron 50 fichas existentes. La clasificación inicial produjo 69 auditorías; las actualizaciones posteriores completaron web, domicilio y localización vacíos de Armero y ampliaron fuentes y servicios de Aicon, TRIA y Berbel Porcel. Todas se auditaron. La última repetición del lote devolvió `sin_cambios=69`.

Se verificaron por huella los campos protegidos, cuentas y CRM de las fichas existentes. No cambiaron; la única ampliación fuera de los campos de pasiva fueron los datos vacíos de Armero expresamente documentados. Las nuevas empresas entraron fuera de perímetro. El detalle de fuentes, precisión de coordenadas y casos todavía abiertos está en [Protección pasiva](PROTECCION_PASIVA.md).

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

- Suite local: **700 tests correctos, 60 archivos, cero fallos**. Cubre estados de pasiva, filtro transversal, deduplicación, preservación de datos, idempotencia y exportación de fuentes.
- Typecheck de la aplicación y del importador: correctos. Build de producción local: correcto; conserva un aviso de lint preexistente en `policia/parse-empresas.ts`.
- API local del build, con sesión admin temporal firmada para la prueba y la base de producción: lite/full devuelven las mismas 69 empresas de pasiva; ficha de Plasfoc, Naes, Control Ignífugo y Armero con fuentes; exportación de las 69 con evidencia; acceso anónimo rechazado con 401. No se verificó el flujo de contraseña con esta sesión de prueba.
- La herramienta de navegador no pudo arrancar en este entorno; queda sin comprobación visual interactiva esta entrega. La validación local de APIs no sustituye una auditoría de todos los flujos.
- La CI del repositorio aplica migraciones, compara el esquema y ejecuta tests, typecheck y build; su resultado y el despliegue se enlazan desde la PR de esta entrega.
- Repositorio público en este corte. La confidencialidad de los datos depende de la autenticación y permisos de la aplicación.

## Entregas recientes

| Fecha | Entrega | Evidencia |
|---|---|---|
| 23/10/2026 | Pasiva transversal, filtro/distintivo/fuentes, API/exportación/chat e importador auditado; primer lote ampliado aplicado | [Implementación y lote](PROTECCION_PASIVA.md) |
| 23/10/2026 | Documentación contrastada y primera investigación de pasiva | [#191](https://github.com/albertofontiber/war-room/pull/191), fusionada |
| 23/10/2026 | Estado SABI, financieros 2025, homogeneización de ingresos, avisos y filtros de estado | [#190](https://github.com/albertofontiber/war-room/pull/190) |
| 15/10/2026 | Emails de acceso con la marca de las pantallas de login | [#189](https://github.com/albertofontiber/war-room/pull/189) |
| 15/10/2026 | Comprador BORME sin cortar por formas jurídicas y alias de Attlon | [#188](https://github.com/albertofontiber/war-room/pull/188) |
| 15/10/2026 | Rol de lectura del chat y búsqueda transversal con doce herramientas | [#187](https://github.com/albertofontiber/war-room/pull/187), [#186](https://github.com/albertofontiber/war-room/pull/186) |
| 14/10/2026 | Gestión de usuarios en BD, invitaciones, Mi cuenta y marca Fontiber en accesos | [#182](https://github.com/albertofontiber/war-room/pull/182), [#184](https://github.com/albertofontiber/war-room/pull/184), [#183](https://github.com/albertofontiber/war-room/pull/183), [#185](https://github.com/albertofontiber/war-room/pull/185) |
| Agosto–septiembre 2026 | RIPCI, habilitaciones, áreas Cepreven, sincronización conjunta de registros y mejoras de tareas/navegación | [#167](https://github.com/albertofontiber/war-room/pull/167)–[#181](https://github.com/albertofontiber/war-room/pull/181) |

## Criterio de mantenimiento

Actualizar este corte cuando cambien datos o comprobaciones relevantes. El código y las PR son la referencia para funcionalidades; la base, para recuentos; [Roadmap](ROADMAP.md), para trabajo abierto. Las antiguas cifras y listas se conservan en Git como historial, no como estado actual.
