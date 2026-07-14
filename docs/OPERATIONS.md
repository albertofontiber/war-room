# Operación y despliegues seguros

Este documento describe cómo operar automatizaciones y cambios de esquema sin
interrumpir el War Room.

## Panel de Operación

La ruta interna `/monitoring` muestra las últimas 50 ejecuciones de BORME,
resúmenes, tareas, documentación, correo y calendario. Registra solo
contadores operativos (duración, registros creados, errores); nunca correos,
tokens, cuerpos de mensajes ni errores crudos de proveedores.

- `Correcto`: ejecución completada sin incidencias.
- `Revisar`: terminó, pero una cuenta, dato o presupuesto de tiempo requiere
  atención.
- `Fallido`: el proceso no pudo completarse. Se crea una notificación in-app y
  se envía un email a los administradores; el detalle técnico está en Vercel
  Logs.
- `En curso`: ejecución iniciada que no ha sido cerrada. Si permanece así más
  de 10 minutos para correo/calendario o 10 horas para BORME, investigar el
  despliegue y la plataforma que la disparó.

## Migraciones Prisma

Desde ahora el esquema se versiona en `prisma/migrations/`. No se debe usar
`prisma db push` para cambios de producción: puede introducir diferencias que
no quedan revisadas ni reproducibles.

### Primera adopción en producción

La base de datos existente fue creada antes de adoptar migraciones, por lo que
ya contiene el esquema de la migración `20260714093000_baseline`. Tras hacer
una copia de seguridad en Supabase y confirmar que el despliegue de código está
en `READY`, ejecutar desde una terminal con las variables de **producción**:

```powershell
npx prisma migrate resolve --applied 20260714093000_baseline
npx prisma migrate deploy
```

El primer comando solo registra la línea base: no modifica tablas ni datos. El
segundo aplica las migraciones posteriores, incluida `CronRun`.

Después, comprobar:

```powershell
npx prisma migrate status
```

El resultado esperado es que no haya migraciones pendientes. Después de que la
migración `CronRun` esté aplicada, una ejecución programada nueva aparecerá en
`/monitoring`.

### Cambios futuros

1. Cambiar `prisma/schema.prisma`.
2. Crear una migración nueva desde una base local o de desarrollo vacía.
3. Revisar el SQL de la migración.
4. Abrir un pull request: la verificación aplica todas las migraciones en un
   PostgreSQL temporal, compara el resultado con el esquema, ejecuta pruebas,
   typecheck y build.
5. Tras desplegar el código, aplicar `npx prisma migrate deploy` con las
   variables de producción.

### Seguridad de acceso a datos (RLS)

War Room usa Prisma en el servidor; los roles de la Data API de Supabase
(`anon`, `authenticated` y `service_role`) no tienen permisos sobre las tablas
del esquema `public`. La migración
`20260714140000_rls_data_api_lockdown` activa RLS y elimina esos permisos en
las tablas existentes, además de retirar los privilegios por defecto para los
objetos creados por `postgres`.

Al crear una nueva tabla en `public`, la misma migración debe incluir
explícitamente `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. Solo si se decide
exponer una funcionalidad mediante la Data API se otorgarán los privilegios
mínimos y se añadirán políticas RLS revisadas en esa misma migración. Tras
cualquier cambio de este tipo, comprobar el Security Advisor de Supabase.

## Observabilidad

- Los logs ya se emiten como JSON estructurado con `level`, `scope`,
  `timestamp` y `context`, para filtrarlos en Vercel.
- Vercel Web Analytics y Speed Insights están incluidos en la aplicación. Sus
  paneles se consultan en el proyecto de Vercel y no requieren secretos
  adicionales.
- Los errores de crons generan una alerta operativa. Para retención larga de
  errores de aplicación o alertas a un canal externo, configurar un Log Drain o
  Sentry requiere elegir y autorizar el proveedor externo antes de activarlo.
