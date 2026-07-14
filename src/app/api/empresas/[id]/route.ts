import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";

export const dynamic = "force-dynamic";
import { authOptions } from "@/lib/auth";
import { calcTendencia, enrichFinancieros } from "@/lib/tendencia";
import { isValidDealStage } from "@/lib/crm";
import { log } from "@/lib/logger";
import type { DealStage } from "@/types";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    // Defense in depth: el middleware ya bloquea finders en host portal,
    // pero validar `kind="admin"` aquí garantiza que ningún path llega al
    // payload completo (CIF, financieros, owner, BORME) sin ser admin.
    if (!session || session.kind !== "admin")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = parseInt(params.id, 10);
    if (isNaN(id))
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const empresa = await prisma.empresa.findUnique({
    where: { id },
    include: {
      grupo: { select: { id: true, nombre: true, tipo: true } },
      financieros: { orderBy: { anio: "desc" } },
      finderSource: { select: { id: true, name: true, email: true } },
      crmEstado: {
        select: {
          dealStage: true,
          ownerUserId: true,
          ownerUser: { select: { id: true, name: true } },
          fechaEntradaStage: true,
          updatedAt: true,
        },
      },
      bormeAlertas: {
        orderBy: { fecha: "desc" },
        take: 20,
        select: {
          id: true,
          fecha: true,
          tipoActo: true,
          grupoInferido: { select: { nombre: true } },
          descripcion: true,
          urlBorme: true,
          leido: true,
        },
      },
      // Última "actividad" = última Tarea completada (tras unificación Tarea+Actividad).
      tareas: {
        where: { completada: true, completadaAt: { not: null } },
        orderBy: { completadaAt: "desc" },
        take: 1,
        select: { completadaAt: true, tipo: true },
      },
      _count: {
        select: {
          tareas: { where: { completada: false } },
        },
      },
    },
  });

  if (!empresa)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Parse servicios JSON
  let servicios: string[] = [];
  try {
    servicios = empresa.servicios ? JSON.parse(empresa.servicios) : [];
  } catch {
    servicios = [];
  }

  const financierosEnriquecidos = enrichFinancieros(empresa.financieros);
  const tendenciaIngresos = calcTendencia(empresa.financieros, "ingresos");
  const tendenciaMargenBruto = calcTendencia(empresa.financieros, "margenBruto");

  // Días acumulados en cada stage a partir de CrmLog + fechaEntradaStage.
  // Para los stages PASADOS usamos las entradas/salidas del log. Para el stage
  // ACTUAL contamos desde fechaEntradaStage hasta hoy.
  const stageDurations: Partial<Record<DealStage, number>> = {};
  if (empresa.crmEstado) {
    const logs = await prisma.crmLog.findMany({
      where: {
        empresaId: id,
        event: { in: ["stage_changed", "new_deal"] },
      },
      orderBy: { createdAt: "asc" },
      select: { fromStage: true, toStage: true, createdAt: true },
    });

    // Reconstruir historia de stages:
    // Cada log es "entró a toStage en createdAt". El tiempo en ese stage es hasta el siguiente log (o hasta hoy si es el último).
    const actualStage = empresa.crmEstado.dealStage;
    for (let i = 0; i < logs.length; i++) {
      const entry = logs[i].toStage;
      if (!entry || !isValidDealStage(entry)) continue;
      const start = logs[i].createdAt;
      const end = logs[i + 1]?.createdAt ?? new Date();
      const dias = Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      // Acumulamos por si la empresa volvió a un stage previo (aunque inusual)
      stageDurations[entry] = (stageDurations[entry] ?? 0) + dias;
    }

    // Para el stage actual, si no hay logs pero sí fechaEntradaStage, usar eso.
    if (actualStage && isValidDealStage(actualStage) && !stageDurations[actualStage]) {
      const fecha = empresa.crmEstado.fechaEntradaStage;
      if (fecha) {
        const dias = Math.max(0, Math.floor((Date.now() - new Date(fecha).getTime()) / (1000 * 60 * 60 * 24)));
        stageDurations[actualStage] = dias;
      }
    }
  }

  return NextResponse.json(
    {
      id: empresa.id,
      cif: empresa.cif,
      nombre: empresa.nombre,
      direccion: empresa.direccion,
      localidad: empresa.localidad,
      provincia: empresa.provincia,
      ccaa: empresa.ccaa,
      lat: empresa.lat,
      lng: empresa.lng,
      sector: empresa.sector,
      servicios,
      empleados: empresa.empleados,
      web: empresa.web,
      linkedin: empresa.linkedin,
      logoUrl: empresa.logoUrl,
      descripcion: empresa.descripcion,
      cepreven: empresa.cepreven,
      aerme: empresa.aerme,
      enPerimetro: empresa.enPerimetro,
      enPerimetroAt: empresa.enPerimetroAt,
      esAnonima: empresa.esAnonima,
      oneDriveUrl: empresa.oneDriveUrl,
      notionUrl: empresa.notionUrl,
      nombreComercial: empresa.nombreComercial,
      scoreInicial: empresa.scoreInicial,
      score: empresa.score,
      updatedAt: empresa.updatedAt,
      grupo: empresa.grupo,
      financieros: financierosEnriquecidos,
      tendenciaIngresos,
      tendenciaMargenBruto,
      crmEstado: empresa.crmEstado,
      finderSource: empresa.finderSource,
      stageDurations,
      bormeAlertas: empresa.bormeAlertas,
      ultimaActividad: empresa.tareas[0]?.completadaAt
        ? { fecha: empresa.tareas[0].completadaAt.toISOString(), tipo: empresa.tareas[0].tipo }
        : null,
      tareasPendientesCount: empresa._count.tareas,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
  } catch (error) {
    log.error("api/empresas/[id] GET", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
