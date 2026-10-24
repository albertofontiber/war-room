# Operación y despliegues seguros

Revisado: **2026-10-24**. Estado de datos y migraciones comprobadas en [Estado actual](PROJECT_STATUS.md). Los comandos de escritura se ejecutan contra el entorno elegido y con el plan de migración/importación revisado.

## Panel de Operación

`/monitoring` muestra las últimas 50 ejecuciones de BORME, resúmenes, tareas, documentación, correo, calendario y registros. `CronRun` guarda duración, estado y contadores; no cuerpos de mensajes, tokens ni errores crudos de proveedores.

- **Correcto:** terminó sin incidencias.
- **Revisar:** terminó con alguna cuenta, fuente o presupuesto de tiempo que requiere atención.
- **Fallido:** no pudo completarse; se genera aviso operativo a admins.
- **En curso:** se inició sin cierre. Si se prolonga, contrastar la duración habitual y el límite de ejecución del proceso con los logs del orquestador; el estado por sí solo no prueba que siga ejecutándose.

Los logs estructurados (`src/lib/logger.ts`) dan el detalle técnico en Vercel. Web Analytics y Speed Insights ya están incorporados. Configurar un proveedor externo adicional de retención o alertas requiere elegir y autorizar ese proveedor.

## Automatizaciones vigentes

Horarios en **UTC**, definidos en `vercel.json` y `.github/workflows/`. En Europe/Madrid sumar una hora en invierno y dos en verano. GitHub Actions no garantiza puntualidad; la frecuencia declarada no acredita una ejecución real.

| Proceso | Orquestador | Programación UTC | Endpoint |
|---|---|---|---|
| BORME del día en curso | Vercel | L–V 20:00 | `/api/cron/borme` |
| Resumen diario | Vercel | Ma–Sa 06:00 | `/api/cron/daily-summary` |
| Digest de tareas | Vercel | L–V 07:00 | `/api/cron/task-digest` |
| Vincular/crear documentación | Vercel | Lunes 07:30 | `/api/cron/target-docs-check` |
| Cepreven, seguridad privada y RIPCI | Vercel | Día 1 de cada mes 08:00 | `/api/cron/registros` |
| Correo de contactos: entrada y salida | GitHub Actions | Cada 15 minutos | `/api/cron/email-tasks` |
| Calendario | GitHub Actions | Cada 30 minutos | `/api/cron/calendar-tasks` |

Todos exigen bearer `CRON_SECRET` y fallan cerrados si falta la variable. Correo y calendario deduplican por cursores e identificadores de origen. Sus workflows permiten backfill manual con ventana explícita; revisar el alcance antes de dispararlo.

El resumen diario se dirige a usuarios activos con `emailDiario=true`. `SUMMARY_EMAIL_TO` ya no gobierna esa selección. El digest incluye tareas sin asignar cuyo autor sea admin, y puede incluir actividad de finders. No reintroducir Pipedrive ni un cron semanal independiente de Cepreven: ambos modelos de operación quedaron sustituidos.

## Migraciones Prisma

El esquema está versionado en `prisma/migrations/`. No usar `prisma db push` en producción: introduciría diferencias sin historial revisable ni reproducible.

### Estado de adopción

La línea base `20260714093000_baseline` y las migraciones posteriores hasta `20261023140000_proteccion_pasiva` constan aplicadas en el corte de datos. La adopción de migraciones y de `CronRun` ya está resuelta.

Solo si se incorpora otra base **preexistente** que ya contiene exactamente el esquema de la línea base, verificar su equivalencia y respaldo antes de registrar:

```powershell
npx prisma migrate resolve --applied 20260714093000_baseline
npx prisma migrate deploy
```

`resolve` registra la línea base sin recrear tablas. No ejecutarlo en una base vacía: en ese caso `prisma migrate deploy` debe aplicar también la línea base. No repetir `resolve` en cada despliegue.

```powershell
npx prisma migrate status
```

El resultado esperado es que no haya migraciones pendientes.

### Cambios futuros

1. Cambiar `prisma/schema.prisma` y generar una migración desde una base de desarrollo.
2. Revisar SQL, compatibilidad con la versión desplegada y recuperación del estado previo.
3. La CI debe aplicar todas las migraciones en PostgreSQL temporal, comparar el resultado con el esquema y ejecutar tests, typecheck y build.
4. Planificar el orden de esquema y código. Una migración aditiva que añade columnas leídas por la app debe aplicarse **antes** de promover ese código. Para cambios destructivos, separar expansión, transición y retirada; no borrar una columna todavía utilizada por alguna versión desplegada.
5. Aplicar `npx prisma migrate deploy` en el punto previsto, comprobar estado y verificar el flujo afectado después del despliegue.

### Seguridad de acceso a datos

La app utiliza Prisma en servidor. RLS y la retirada de permisos de `anon`, `authenticated` y `service_role` cierran la Data API sobre las tablas del esquema `public`. No confundir esa barrera con la autorización propia de las rutas de la app.

Una tabla nueva en `public` debe activar RLS explícitamente en su migración. Solo si se decide exponer una función por la Data API se conceden privilegios mínimos y políticas revisadas en esa misma entrega. Revisar también los privilegios por defecto y el Security Advisor después de cambios de acceso.

## Importación SABI

La importación de octubre está integrada en #190 y sus datos se comprobaron en el corte del estado actual. No es una tarea pendiente ni debe repetirse automáticamente en cada despliegue.

Para otra extracción compatible, revisar hoja, fecha y definiciones financieras. Simulación por defecto:

```powershell
node --env-file=.env.local --import tsx scripts/import-sabi-financieros.ts "ruta/extraccion.xlsx" --fecha 2026-10-23 --informe "logs/sabi-simulacion.csv"
```

El comando no escribe en la base; el informe CSV sí se guarda localmente. Revisar CIF sin match, duplicados, estados, cuentas nuevas/actualizadas, empleados y borrados propuestos. La escritura exige añadir `--apply` y utiliza una transacción única. Aplicar antes la migración requerida y disponer de una copia recuperable del estado previo.

Los nulos no pisan cifras previas, los años íntegramente a cero no se cargan y solo se actualizan cuentas de activas o en concurso. La retirada de cuentas `informa_2026` restantes es una regla específica de homogeneización de esa fuente: revisar su efecto antes de reutilizar el importador para otro lote.

## Importación de pasiva

El lote y sus fuentes están en [Protección pasiva](PROTECCION_PASIVA.md). La migración aditiva de pasiva debe estar aplicada antes de desplegar código que lea esas columnas. El script no descubre empresas automáticamente: recibe filas previamente revisadas.

```powershell
node --env-file=.env.local --import tsx scripts/import-pasiva.ts docs/research/pasiva-validada-2026-10-24.json
```

Simula por defecto. La escritura requiere `--apply`, revalida el cruce en una transacción y usa un advisory lock para serializar importaciones de pasiva. Si queda una fila `revisar`, se aborta todo el lote. Bloquea CIF duplicados o ambiguos, dominios asociados a otro CIF, leads anónimos y revisiones negativas previas. Las altas exigen identidad fiscal, localización y `permitirAlta=true`; se crean fuera de perímetro y con estado SABI sin consultar.

Los enriquecimientos conservan sector, perímetro, CRM, cuentas y fuente original. Por defecto cambian solo los cuatro campos de pasiva. `completarVacios=true` permite, con fuente fiscal primaria, completar web, domicilio o localización ausentes; conserva cualquier dato ya presente y completa coordenadas solo como par. El lote del 23/10 lo usó para Armero; el del 24/10, para las webs de Extinhouse Group y PCI Tudemana 2021 y el domicilio/localización vacíos de Extinhouse Group. Las coordenadas municipales y su procedencia se documentan en cada lote.

Cada escritura deja `AuditLog` con valores anteriores y posteriores, lote e identidad de fuente. Disponer de un respaldo de los campos afectados y revisar el informe antes de aplicar. Repetir la misma versión del lote debe devolver `sin_cambios` para todas las filas; no ejecutar la importación como cron. En el corte actual ya está aplicada.

## Configuración del chat

`CHAT_READONLY_DATABASE_URL` debe apuntar al rol de lectura del chat en cada entorno. No registrar la URL en logs. El rol y sus exclusiones están definidos en `scripts/create-chat-readonly-role.ts`; su creación ya se realizó (#187).

Después de añadir columnas a `User` o `Finder`, revisar los grants por columna sin conceder acceso a hashes. La existencia del rol no prueba que un entorno nuevo tenga configurada su URL. El código conserva fallback a la conexión normal si falta la variable, por lo que hay que comprobar esta configuración explícitamente.
