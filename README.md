# Fontiber War Room

Aplicación de inteligencia y gestión M&A para Fontiber Industrial Partners: universo de empresas españolas de protección contra incendios y seguridad electrónica, actividad transversal de protección pasiva, financieros, señales BORME, grupos y CRM propio.

- War Room del equipo: <https://warroom.fontiber.com>.
- Portal de finders: <https://portal.fontiber.com>.
- Ambos se sirven desde el mismo proyecto de Vercel, con permisos distintos.

## Documentación

| Documento | Contenido |
|---|---|
| [Estado actual](docs/PROJECT_STATUS.md) | Corte fechado de datos, versiones, entregas y comprobaciones |
| [Arquitectura](docs/ARCHITECTURE.md) | Componentes, flujos, modelo de datos y decisiones |
| [Instrucciones de desarrollo](instructions.md) | Reglas de negocio y convenciones que hay que preservar |
| [Operación](docs/OPERATIONS.md) | Migraciones, automatizaciones, observabilidad e importaciones |
| [Responsive](docs/RESPONSIVE.md) | Breakpoints, componentes y comportamiento móvil |
| [Trabajo abierto](docs/ROADMAP.md) | Encargos actuales, limitaciones y propuestas por priorizar |
| [Protección pasiva](docs/PROTECCION_PASIVA.md) | Investigación, fuentes y ampliación del universo sin duplicados |
| [Dudas de pasiva para el repaso](docs/research/pasiva-dudas-2026-10-25.md) | Cinco dudas prioritarias reconsultadas, prueba concreta pendiente y antecedentes resueltos |
| [Actividades](docs/ACTIVIDADES.md) | PCI activa, PCI pasiva y seguridad electrónica; criterio y filtros combinables |

Las cifras cambiantes se publican únicamente en el estado actual, con fecha y método. El historial de implementaciones está en Git y en las PR; una propuesta antigua no equivale a un pendiente aprobado.

## Desarrollo local

Requisitos: Node.js 24, npm y acceso a una base PostgreSQL de desarrollo compatible con el esquema Prisma.

```powershell
npm ci
Copy-Item .env.example .env.local
# Completar .env.local con las credenciales del entorno elegido.
npx prisma generate
npm run dev
```

La aplicación local abre en <http://localhost:3000>. Las rutas `/portal/*` permiten trabajar en el portal sin configurar un subdominio local. La configuración local puede apuntar a producción: comprobar el destino antes de ejecutar comandos de escritura. Para preparar una base vacía o desplegar cambios de esquema, seguir [Operación](docs/OPERATIONS.md).

## Verificación

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
```

La CI aplica las migraciones sobre PostgreSQL temporal, compara el resultado con `schema.prisma` y ejecuta tests, typecheck y build. No necesita credenciales de producción.

## Stack

Next.js 15 App Router, React 19, TypeScript, Prisma 5 y PostgreSQL en Supabase. Tailwind CSS, Zustand y Mapbox en el cliente. NextAuth separa las sesiones del equipo y de finders. El chat utiliza Vercel AI SDK y Anthropic; Microsoft Graph, Notion y Resend cubren las integraciones operativas.
