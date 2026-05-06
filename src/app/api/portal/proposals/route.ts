import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCurrentFinder } from "@/lib/finder-session";
import { ProposalCreateSchema, zodError } from "@/lib/validation";
import { normalizePersona } from "@/lib/normalize";
import { logFinderAction } from "@/lib/finder-access-log";
import { notifyAdmins } from "@/lib/notifications";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/portal/proposals — el finder propone un target nuevo.
 *
 * Dedup check:
 *   1. Si `cif` llega, comparar exacto contra Empresa.cif. Match → existe.
 *   2. Si no, comparar `normalizePersona(companyName, true)` contra la
 *      normalización de todos los nombres del universo. Match → existe.
 *
 * Si existe → respuesta 200 con `{existe:true}` SIN crear la propuesta.
 *   No revelamos detalles de la empresa (ni stage, ni owner, ni si está en
 *   perímetro). Solo indicamos que "ya está en seguimiento".
 *
 * Si no existe → crea TargetProposal status=PENDING con `finderId` = sesión.
 *
 * En ambos casos loguea FinderAccessLog(action="propose_target").
 */
export async function POST(req: NextRequest) {
  let finder;
  try {
    finder = await requireCurrentFinder();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = ProposalCreateSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  // Dedup
  const cif = body.cif?.trim().toUpperCase();
  let existe = false;

  if (cif && cif.length > 0) {
    const match = await prisma.empresa.findUnique({ where: { cif }, select: { id: true } });
    existe = !!match;
  }

  if (!existe) {
    const norm = normalizePersona(body.companyName, true);
    if (norm.length >= 3) {
      // Comparación contra todos los nombres normalizados. Universo ~5k → OK en
      // memoria. Si crece, mover a un campo precomputado con índice.
      const empresas = await prisma.empresa.findMany({
        where: { esAnonima: false },
        select: { nombre: true },
      });
      existe = empresas.some((e) => normalizePersona(e.nombre, true) === norm);
    }
  }

  // Siempre creamos como PENDING: Alberto quiere revisar también los
  // posibles duplicados (no auto-cerrarlos). Desde el portal el finder
  // ve "Propuesta enviada" sin distinción. El flag `existe` se usa
  // sólo para el log de auditoría y lo muestra la vista admin como
  // "posible duplicado" calculándolo on-the-fly al leer.
  const proposal = await prisma.targetProposal.create({
    data: {
      finderId: finder.id,
      companyName: body.companyName.trim(),
      cif: cif || null,
      website: body.website?.trim() || null,
      contactName: body.contactName?.trim() || null,
      contactRole: body.contactRole?.trim() || null,
      notes: body.notes?.trim() || null,
      status: "PENDING",
    },
    select: { id: true, companyName: true, createdAt: true, status: true },
  });

  await logFinderAction({
    finderId: finder.id,
    action: existe ? "propose_target_duplicate" : "propose_target",
    resourceId: String(proposal.id),
  });

  // Notifica a los admins (in-app + email). Fire-and-forget: si falla, la
  // propuesta ya está creada y registrada en el log; no bloqueamos al finder.
  const dupSuffix = existe ? " (posible duplicado)" : "";
  const cifLine = cif ? `\nCIF: ${cif}` : "";
  notifyAdmins({
    tipo: "proposal_new",
    titulo: `Nueva propuesta de ${finder.name}: ${body.companyName.trim()}${dupSuffix}`,
    mensaje: `${finder.name} ha propuesto un nuevo target.\n\nEmpresa: ${body.companyName.trim()}${cifLine}\n\nRevísala desde Propuestas de finders.`,
    link: "/finders/proposals?status=PENDING",
  }).catch((err) => {
    log.error("api/portal/proposals POST notifyAdmins", err);
  });

  return NextResponse.json({ proposal }, { status: 201 });
}

/**
 * GET /api/portal/proposals — lista propuestas hechas por este finder.
 * Sin revelar la `rejectionReason` interna. Solo status y timestamps.
 */
export async function GET() {
  let finder;
  try {
    finder = await requireCurrentFinder();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const proposals = await prisma.targetProposal.findMany({
    where: { finderId: finder.id },
    select: {
      id: true,
      companyName: true,
      cif: true,
      website: true,
      contactName: true,
      contactRole: true,
      status: true,
      createdAt: true,
      reviewedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(proposals);
}
