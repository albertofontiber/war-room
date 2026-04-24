/**
 * extract-oneliners.ts — Extract structured one-liners from company websites
 *
 * For each empresa in perimeter with web but no descripcion:
 * 1. Scrapes the homepage + /servicios (or similar)
 * 2. Sends extracted text to Claude Haiku for structured extraction
 * 3. Saves the one-liner to empresa.descripcion
 *
 * Usage: npx dotenv-cli -e .env.local -- npx tsx scripts/extract-oneliners.ts [--limit N] [--dry-run]
 */

import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit"));
const LIMIT = limitArg ? parseInt(args[args.indexOf(limitArg) + 1]) : 9999;
const DRY_RUN = args.includes("--dry-run");

// ─── Scraping ────────────────────────────────────────────────────────────────

async function fetchPageText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    const res = await fetch(fullUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    // Extract text content
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#\d+;/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000); // Keep under token limit
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

async function scrapeCompany(web: string): Promise<string | null> {
  const base = web.startsWith("http") ? web : `https://${web}`;
  const baseClean = base.replace(/\/+$/, "");

  // Try multiple pages
  const pages = [
    baseClean,
    `${baseClean}/servicios`,
    `${baseClean}/services`,
    `${baseClean}/serveis`,
    `${baseClean}/quienes-somos`,
    `${baseClean}/sobre-nosotros`,
    `${baseClean}/about`,
  ];

  const texts: string[] = [];
  for (const page of pages) {
    const text = await fetchPageText(page);
    if (text && text.length > 100) {
      texts.push(text.slice(0, 2500));
      if (texts.length >= 3) break; // Enough context
    }
  }

  return texts.length > 0 ? texts.join("\n\n---\n\n") : null;
}

// ─── LLM Extraction ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un analista de M&A que necesita entender rápidamente qué hace una empresa del sector PCI/seguridad en España.

A partir del contenido web, extrae SOLO hechos concretos. Responde con un JSON válido, sin markdown.

REGLAS CRÍTICAS para el campo "one_liner":
- PROHIBIDO incluir frases genéricas de marketing: "soluciones integrales", "personal cualificado", "cumplimiento normativo", "compromiso con la calidad", "tecnología de última generación", "experiencia y profesionalidad", "servicio personalizado", "empresa líder", "referente en el sector"
- PROHIBIDO mencionar cosas que TODAS las empresas del sector hacen (cumplir normativa, tener experiencia, ofrecer calidad)
- SOLO incluir hechos diferenciadores y concretos:
  - Qué servicios específicos ofrecen (no "PCI integral" sino "extintores, BIEs, rociadores")
  - Si hacen algo ADEMÁS de PCI/seguridad (climatización, electricidad, fotovoltaica, etc.)
  - Tipo de cliente si es específico (industrial, hospitales, retail, comunidades...)
  - Si tienen delegaciones en varias ubicaciones, mencionarlas
  - Certificaciones ISO más allá de 9001 (14001, 45001)
  - Si son distribuidores/instaladores oficiales de alguna marca concreta
- Formato: 1 frase, máximo 2. Estilo telegráfico. Sin adjetivos vacíos.

Ejemplo BUENO: "PCI (extintores, BIEs, detección) y climatización en Murcia. También instalan fotovoltaica. ISO 14001. Distribuidor Notifier."
Ejemplo MALO: "Empresa líder en soluciones integrales de protección contra incendios con más de 20 años de experiencia y personal altamente cualificado."

Campos:
- "servicios": string — Líneas concretas: qué sistemas PCI, si hacen seg. electrónica, y qué otras líneas (climatización, electricidad, fotovoltaica, telecomunicaciones, etc.)
- "tipo_clientes": string | null — Solo si es detectable y específico
- "sistemas_pci": string | null — Sistemas concretos: extintores, BIEs, extinción por gas, rociadores, grupos de presión, detección, protección pasiva, etc.
- "delegaciones": string | null — Solo si menciona oficinas en múltiples ubicaciones
- "certificaciones_iso": string | null — Solo ISOs más allá de 9001 (14001, 45001, etc.)
- "one_liner": string — Resumen concreto siguiendo las reglas anteriores

Si la web no tiene relación con PCI/seguridad, responde: {"irrelevant": true}`;

async function extractOneLiner(
  nombre: string,
  webContent: string
): Promise<Record<string, unknown> | null> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Empresa: "${nombre}"\n\nContenido web:\n${webContent.slice(0, 6000)}`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error(`   Error LLM for ${nombre}:`, err);
    return null;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const empresas = await prisma.empresa.findMany({
    where: {
      enPerimetro: true,
      web: { not: null },
      descripcion: null,
    },
    select: { id: true, nombre: true, web: true },
    orderBy: { nombre: "asc" },
    take: LIMIT,
  });

  console.log(
    `🔍 Extracting one-liners for ${empresas.length} empresas${DRY_RUN ? " (DRY RUN)" : ""}...\n`
  );

  let processed = 0;
  let success = 0;
  let failed = 0;
  let irrelevant = 0;
  let noContent = 0;

  const BATCH = 5; // Conservative: avoid rate limits
  for (let i = 0; i < empresas.length; i += BATCH) {
    const batch = empresas.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (emp) => {
        const content = await scrapeCompany(emp.web!);
        if (!content || content.length < 50) {
          noContent++;
          processed++;
          return;
        }

        const result = await extractOneLiner(emp.nombre, content);
        if (!result) {
          failed++;
          processed++;
          return;
        }

        if (result.irrelevant) {
          irrelevant++;
          processed++;
          return;
        }

        const oneLiner = result.one_liner as string;
        if (!oneLiner || oneLiner.length < 10) {
          failed++;
          processed++;
          return;
        }

        if (!DRY_RUN) {
          await prisma.empresa.update({
            where: { id: emp.id },
            data: { descripcion: oneLiner },
          });
        }

        success++;
        processed++;

        if (processed % 20 === 0) {
          console.log(
            `   [${processed}/${empresas.length}] ✓${success} ✗${failed} ⊘${irrelevant} ∅${noContent}`
          );
        }
      })
    );

    // Small delay between batches to respect rate limits
    if (i + BATCH < empresas.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`\n✅ Extracción completada:`);
  console.log(`   Procesadas: ${processed}`);
  console.log(`   One-liners guardados: ${success}`);
  console.log(`   Sin contenido web: ${noContent}`);
  console.log(`   Irrelevantes: ${irrelevant}`);
  console.log(`   Errores: ${failed}`);

  await prisma.$disconnect();
}

main().catch(console.error);
