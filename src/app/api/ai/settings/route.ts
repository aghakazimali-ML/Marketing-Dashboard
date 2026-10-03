import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AiProvider } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/auth/authorization";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { audit } from "@/lib/audit";

const settingsSchema = z.object({
  provider: z.enum(["OPENAI", "ANTHROPIC", "XAI", "GOOGLE"]),
  model: z.string().trim().min(1).max(100),
  apiKey: z.string().trim().min(20).max(500).optional(),
  clearApiKey: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;

  const settings = await prisma.aiSettings.findUnique({
    where: { id: 1 },
    select: { provider: true, model: true, apiKey: true, updatedAt: true },
  });
  return NextResponse.json({
    configured: Boolean(settings?.apiKey && decryptSecret(settings.apiKey)),
    provider: settings?.provider ?? "OPENAI",
    model: settings?.model ?? "gpt-4o-mini",
    updatedAt: settings?.updatedAt ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  const parsed = settingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a model and a valid API key." }, { status: 400 });
  }

  const existing = await prisma.aiSettings.findUnique({ where: { id: 1 } });
  if (!existing && !parsed.data.apiKey) {
    return NextResponse.json({ error: "An API key is required for initial setup." }, { status: 400 });
  }
  if (
    existing &&
    existing.provider !== parsed.data.provider &&
    !parsed.data.apiKey &&
    !parsed.data.clearApiKey
  ) {
    return NextResponse.json(
      { error: "Enter an API key for the selected provider; keys are not shared between providers." },
      { status: 400 }
    );
  }

  const apiKey = parsed.data.clearApiKey
    ? null
    : parsed.data.apiKey
      ? encryptSecret(parsed.data.apiKey)
      : existing?.apiKey ?? null;
  const settings = await prisma.aiSettings.upsert({
    where: { id: 1 },
    create: { id: 1, provider: parsed.data.provider as AiProvider, model: parsed.data.model, apiKey },
    update: { provider: parsed.data.provider as AiProvider, model: parsed.data.model, apiKey },
    select: { provider: true, model: true, apiKey: true, updatedAt: true },
  });

  await audit("ai.settings_changed", {
    req,
    actor: access.session,
    meta: { provider: settings.provider, model: settings.model, keyChanged: Boolean(parsed.data.apiKey || parsed.data.clearApiKey) },
  });
  return NextResponse.json({
    configured: Boolean(settings.apiKey && decryptSecret(settings.apiKey)),
    provider: settings.provider,
    model: settings.model,
    updatedAt: settings.updatedAt,
  });
}