import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/authorization";
import { gateFeature } from "@/lib/billing/workspace";
import { generateApiKey } from "@/lib/api-keys";
import { audit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;
  const gate = await gateFeature("apiAccess");
  if (!gate.ok) return gate.response;
  const keys = await prisma.apiKey.findMany({
    where: { revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, createdBy: true },
  });
  return NextResponse.json({ keys, limit: gate.workspace.plan.limits.apiKeys });
}

export async function POST(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;
  const gate = await gateFeature("apiAccess");
  if (!gate.ok) return gate.response;

  const body = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Give the key a name." }, { status: 400 });

  const active = await prisma.apiKey.count({ where: { revokedAt: null } });
  if (active >= gate.workspace.plan.limits.apiKeys) {
    return NextResponse.json({ error: `Your plan includes up to ${gate.workspace.plan.limits.apiKeys} active API keys. Revoke one first.`, code: "plan_limit" }, { status: 402 });
  }
  const { key, prefix, hash } = generateApiKey();
  const row = await prisma.apiKey.create({ data: { name: body.data.name, prefix, keyHash: hash, createdBy: access.session.email } });
  await audit("channel.token_changed", { req, actor: access.session, target: `api-key:${row.name}`, meta: { action: "created" } });
  // The full key is shown exactly once.
  return NextResponse.json({ id: row.id, name: row.name, prefix, key }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await prisma.apiKey.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit("channel.token_changed", { req, actor: access.session, target: `api-key:${id}`, meta: { action: "revoked" } });
  return NextResponse.json({ ok: true });
}
