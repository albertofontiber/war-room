# Estado actual del proyecto

Corte: **24 de octubre de 2026, 13:10 Europe/Madrid**. Código de referencia: [#193](https://github.com/albertofontiber/war-room/pull/193), fusionada en `cd869d5`. Este corte incorpora el tercer lote de pasiva, de asociaciones y búsqueda regional, aplicado en producción. Es una instantánea fechada, no un contador en vivo.

## Datos comprobados

Consulta a la base configurada para producción mediante Prisma dentro de una transacción `READ ONLY`, después de aplicar el lote de pasiva. Las altas y enriquecimientos previos se auditaron por separado; el recuento no realizó escrituras.

| Métrica | Resultado | Definición |
|---|---:|---|
| Empresas del universo | 5.824 | `Empresa` con `esAnonima=false` |
| Sector PCI | 4.586 | Valor `PCI` |
| Seguridad electrónica | 770 | Valor `seguridad_electronica` |
| Mixtas | 468 | PCI y seguridad electrónica; no significa activa y pasiva |
| Pasiva confirmada | 222 | `proteccionPasiva=true`; cobertura parcial, no censo del mercado |
| Años de cuentas | 23.620 | Filas de `Financiero`; no número de empresas |
| Cuentas del ejercicio 2025 | 2.725 | Filas con `anio=2025`, todas las fuentes |
| Años de cuentas de la extracción SABI de octubre | 15.766 | Filas con `fuente=sabi_2610` |
| Empresas con web no nula | 3.389 | El dato no acredita que todas las webs funcionen o estén validadas |
| En perímetro sin web | 1.492 | `enPerimetro=true`, web nula o vacía y no anónima |
| Empresas con coordenadas en las API de mapa/tabla | 5.192 | Las listas geográficas excluyen coordenadas nulas; no es el total del universo |
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
| Sin consultar | 61 |

El total de estados coincide con el universo del corte. No encontrada en SABI no implica inactividad. Las altas de pasiva conservan `estado=null` hasta una consulta SABI; no se han clasificado como activas por su web.

Las diez migraciones versionadas hasta `20261023140000_proteccion_pasiva` constan aplicadas, sin pendientes. La presencia de estados y filas `sabi_2610` acredita la carga de octubre en la base.

### Cambio respecto al corte anterior

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
- API de producción en `warroom.fontiber.com`, con sesión admin temporal firmada para la prueba: lite/full devuelven las mismas **222** empresas de pasiva y la exportación conserva fuentes para las 222. Los 38 CIF del lote aparecen una sola vez. Fichas verificadas: Plasfoc, Naes, Blinders, IPS Incendio, Gestiplac, Brapesa Canarias, Sella2, Técnicas de Refractarios, Escadur y Project TGN. Acceso anónimo rechazado con 401. Esta sesión de prueba no verifica el flujo de contraseña.
- La entrega de #192 quedó sin comprobación visual interactiva por fallo de la herramienta de navegador. El 24/10 se verificaron datos y APIs de producción; no se ha añadido una comprobación visual ni una auditoría de todos los flujos.
- La CI del repositorio aplica migraciones, compara el esquema y ejecuta tests, typecheck y build; su resultado y el despliegue se enlazan desde la PR de esta entrega.
- Repositorio público en este corte. La confidencialidad de los datos depende de la autenticación y permisos de la aplicación.

## Entregas recientes

| Fecha | Entrega | Evidencia |
|---|---|---|
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
