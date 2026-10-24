# Actividades combinables

Revisión: **24/10/2026**. Criterio de Alberto: las empresas PCI del universo previo, procedentes del RIPCI, hacen PCI activa al menos.

El filtro **Actividades** sustituye al filtro de sector en mapa, tabla y pipeline. Ofrece **PCI activa**, **PCI pasiva** y **Seguridad electrónica**. **Todas las seleccionadas** es el modo por defecto; al marcar las tres exige las tres. **Cualquiera de las seleccionadas** incluye empresas con al menos una de ellas. Sin selección no restringe. Seleccionar activa y pasiva permite que la empresa también haga seguridad electrónica.

| Actividad | Criterio |
|---|---|
| PCI activa | Sector previo `PCI` o `mixto`, salvo altas de prospección con fuente `investigacion_pasiva_*`. Un RIPCI con categorías válidas de instalación o mantenimiento también acredita activa, cualquiera que sea el sector de origen. |
| PCI pasiva | `proteccionPasiva=true`, con evidencia en la ficha. Un valor ausente o una revisión no concluyente no acreditan ni descartan la actividad. |
| Seguridad electrónica | Sector `seguridad_electronica` o `mixto`. |

`mixto` se conserva en la base para compatibilidad y formas del mapa; representa PCI y seguridad electrónica, sin constituir una cuarta actividad. Las altas de investigación pasiva conservan `sector=PCI` como familia histórica, pero no reciben activa solo por ese valor. La ausencia de una actividad en la lista no significa revisión negativa.

La función compartida `src/lib/actividades.ts` genera las actividades a partir de los datos existentes; no hay migración, reclasificación de sociedades ni nuevas escrituras en producción. Lite/full, ficha, exportación, pipeline y las dos APIs de Operaciones usan el mismo criterio. El filtro global también se aplica a Señales M&A y Alertas personas. En este último caso sigue bastando una empresa de la persona que cumpla, manteniendo las demás para contexto.

Tabla, tooltip, ficha y Excel muestran las actividades combinadas. La lista de actividades del tooltip admite la serialización JSON de Mapbox. El desplegable **Revisión de PCI pasiva** se conserva separado para consultar confirmadas, revisadas sin actividad o sin revisar. La procedencia interna usada para calcular activa no se añade a los payloads públicos de estas vistas.

La selección no altera perímetro, CRM, fuentes, estado SABI ni financieros. Para incluir las altas de prospección, usar **Perímetro → Todos**. Los recuentos del corte y la verificación están en [Estado actual](PROJECT_STATUS.md); las evidencias empresariales, en [PCI pasiva](PROTECCION_PASIVA.md).
