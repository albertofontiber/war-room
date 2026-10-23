# Estado actual del proyecto

Corte: **23 de octubre de 2026**. Código: `main`, commit [`6e26851`](https://github.com/albertofontiber/war-room/commit/6e2685161a3b5cf1e0335e9d1ea5c8bbd8b562ed), PR #190. Es un corte fechado, no un contador en vivo.

## Datos comprobados

Consulta a la base configurada para producción el 23/10/2026 a las **11:11 Europe/Madrid**, mediante Prisma dentro de una transacción `READ ONLY`. Se consultaron agregados del universo y metadatos de migraciones; no se ejecutaron escrituras.

| Métrica | Resultado | Definición |
|---|---:|---|
| Empresas del universo | 5.763 | `Empresa` con `esAnonima=false` |
| Sector PCI | 4.525 | Valor `PCI` |
| Seguridad electrónica | 770 | Valor `seguridad_electronica` |
| Mixtas | 468 | PCI y seguridad electrónica; no significa activa y pasiva |
| Años de cuentas | 23.620 | Filas de `Financiero`; no número de empresas |
| Cuentas del ejercicio 2025 | 2.725 | Filas con `anio=2025`, todas las fuentes |
| Años de cuentas de la extracción SABI de octubre | 15.766 | Filas con `fuente=sabi_2610` |
| Empresas con web no nula | 3.322 | El dato no acredita que la web funcione o esté validada |
| En perímetro sin web | 1.497 | `enPerimetro=true`, web nula o vacía y no anónima |
| Empresas con áreas Cepreven de pasiva guardadas | 3 | Algún código `PAS-COMP`, `PAS-REAC` o `PAS-ESTR`; no es el universo total de pasiva |

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

El total de estados coincide con el universo de este corte. No encontrada en SABI no implica inactividad. Las altas posteriores pueden tener `estado=null` hasta una nueva consulta.

La base contiene las nueve migraciones versionadas hasta `20261023120000_empresa_estado`, registradas como aplicadas. La presencia de estados y filas `sabi_2610` acredita que la carga SABI existe en la base, además de estar integrada en el código.

### Repetir el recuento

Ejecutar únicamente `SELECT` en el entorno que se desea documentar y registrar fecha, destino y commit. Ejemplo del núcleo de la comprobación:

```sql
BEGIN TRANSACTION READ ONLY;
SELECT count(*) FROM "Empresa" WHERE NOT "esAnonima";
SELECT sector, count(*) FROM "Empresa"
  WHERE NOT "esAnonima" GROUP BY sector;
SELECT estado, count(*) FROM "Empresa"
  WHERE NOT "esAnonima" GROUP BY estado;
SELECT anio, count(*) FROM "Financiero" GROUP BY anio ORDER BY anio;
SELECT fuente, count(*) FROM "Financiero" GROUP BY fuente;
SELECT count(*) FROM "Empresa"
  WHERE NOT "esAnonima" AND "enPerimetro" AND (web IS NULL OR web = '');
SELECT migration_name, finished_at FROM _prisma_migrations
  WHERE rolled_back_at IS NULL ORDER BY migration_name;
ROLLBACK;
```

## Código y verificación

Versiones declaradas por el proyecto: Next.js 15.5.18, React/React DOM 19.2.4, Prisma 5.22, NextAuth 4.24 y Vercel AI SDK 6. El lockfile define las versiones exactas instalables. La CI utiliza Node.js 24 y PostgreSQL 16 temporal.

- Suite local ejecutada en este corte: **687 tests correctos, 58 archivos, cero fallos** (`npm test`, Vitest).
- [CI de `main`](https://github.com/albertofontiber/war-room/actions/runs/39925792991): completada correctamente el 23/10/2026; incluye migraciones, comparación de esquema, tests, typecheck y build.
- [Despliegue asociado a ese commit](https://vercel.com/albertofontibers-projects/war-room/DGRC6FZt2QAomiLH13UrbnLeaZEw): GitHub informa de despliegue completado. Esto no sustituye una auditoría funcional de todos los flujos.
- Repositorio con visibilidad pública en este corte; el carácter privado de los datos de la aplicación depende de su autenticación y permisos, no de la visibilidad del código.

## Entregas recientes

| Fecha | Entrega | Evidencia |
|---|---|---|
| 23/10/2026 | Estado SABI, financieros 2025, homogeneización de ingresos, avisos y filtros de estado | [#190](https://github.com/albertofontiber/war-room/pull/190) |
| 15/10/2026 | Emails de acceso con la marca de las pantallas de login | [#189](https://github.com/albertofontiber/war-room/pull/189) |
| 15/10/2026 | Comprador BORME sin cortar por formas jurídicas y alias de Attlon | [#188](https://github.com/albertofontiber/war-room/pull/188) |
| 15/10/2026 | Rol de lectura del chat y búsqueda transversal con doce herramientas | [#187](https://github.com/albertofontiber/war-room/pull/187), [#186](https://github.com/albertofontiber/war-room/pull/186) |
| 14/10/2026 | Gestión de usuarios en BD, invitaciones, Mi cuenta y marca Fontiber en accesos | [#182](https://github.com/albertofontiber/war-room/pull/182), [#184](https://github.com/albertofontiber/war-room/pull/184), [#183](https://github.com/albertofontiber/war-room/pull/183), [#185](https://github.com/albertofontiber/war-room/pull/185) |
| Agosto–septiembre 2026 | RIPCI, habilitaciones, áreas Cepreven, sincronización conjunta de registros y mejoras de tareas/navegación | [#167](https://github.com/albertofontiber/war-room/pull/167)–[#181](https://github.com/albertofontiber/war-room/pull/181) |

## Criterio de mantenimiento

Actualizar este corte cuando cambien cifras o comprobaciones relevantes. Evitar repetir sus números en otros documentos. El código y las PR son la referencia para funcionalidades; la base, para recuentos; [Roadmap](ROADMAP.md), para trabajo abierto. Las antiguas cifras y listas de abril se conservan en Git como historial, no como estado actual.
