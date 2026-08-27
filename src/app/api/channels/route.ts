import { NextRequest, NextResponse } from "next/server";
import { Platform } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { encryptSecret, hasSecret } from "@/lib/crypto/secrets";
import { isSafeExternalId } from "@/lib/security/sanitize";
import { rateLimit } from "@/lib/security/rate-limit";
import { z } from "zod";

function serializeChannel(ch: {
  id: string;
  platform: Platform;
  name: string;
  handle: string | null;
  externalId: string | null;
  pageUrl: string | null;
  accessToken: string | null;
  apiKey: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: ch.id,
    platform: ch.platform,
    name: ch.name,
    handle: ch.handle,
    externalId: ch.externalId,
    pageUrl: ch.pageUrl,
    notes: ch.notes,
    isActive: ch.isActive,
    createdAt: ch.createdAt,
    updatedAt: ch.updatedAt,
    hasAccessToken: hasSecret(ch.accessToken),
    hasApiKey: hasSecret(ch.apiKey),
  };
}

const channelBodySchema = z.object({
  platform: z.string().optional(),
  name: z.string().min(1).max(120).optional(),
  handle: z.string().max(80).optional().nullable(),
  externalId: z.string().max(128).optional().nullable(),
  pageUrl: z.string().max(500).optional().nullable(),
  accessToken: z.string().max(4000).optional().nullable(),
  apiKey: z.string().max(4000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
  id: z.string().optional(),
  clearAccessToken: z.boolean().optional(),
  clearApiKey: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const platform = req.nextUrl.searchParams.get("platform")?.toUpperCase() as
      | Platform
      | undefined;

    const channels = await prisma.channel.findMany({
      where: platform ? { platform } : undefined,
      orderBy: [{ platform: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({
      channels: channels.map(serializeChannel),
    });
  } catch (e) {
    console.error("[channels GET]", e);
    return NextResponse.json({ error: "Failed to load channels" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(`channels:${req.headers.get("x-forwarded-for") || "local"}`, 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  try {
    const parsed = channelBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = parsed.data;
    const platform = (body.platform || "LINKEDIN").toUpperCase() as Platform;
    if (!Object.values(Platform).includes(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Page / account name is required" }, { status: 400 });
    }
    if (body.externalId?.trim() && !isSafeExternalId(body.externalId)) {
      return NextResponse.json(
        { error: "Invalid Organization / Page ID format" },
        { status: 400 }
      );
    }

    const existing = await prisma.channel.findUnique({
      where: {
        platform_name: { platform, name: body.name.trim() },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: `A ${platform} page named "${body.name.trim()}" already exists` },
        { status: 409 }
      );
    }

    const channel = await prisma.channel.create({
      data: {
        platform,
        name: body.name.trim(),
        handle: body.handle?.trim() || null,
        externalId: body.externalId?.trim() || null,
        pageUrl: body.pageUrl?.trim() || null,
        accessToken: encryptSecret(body.accessToken),
        apiKey: encryptSecret(body.apiKey),
        notes: body.notes?.trim() || null,
        isActive: body.isActive ?? true,
      },
    });

    return NextResponse.json({ channel: serializeChannel(channel) }, { status: 201 });
  } catch (e) {
    console.error("[channels POST]", e);
    return NextResponse.json({ error: "Failed to create channel" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const limited = rateLimit(`channels-patch:${req.headers.get("x-forwarded-for") || "local"}`, 40, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const parsed = channelBodySchema.safeParse(await req.json());
    if (!parsed.success || !parsed.data.id) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const body = parsed.data;
    if (body.externalId?.trim() && !isSafeExternalId(body.externalId)) {
      return NextResponse.json(
        { error: "Invalid Organization / Page ID format" },
        { status: 400 }
      );
    }

    const channel = await prisma.channel.update({
      where: { id: body.id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.handle !== undefined
          ? { handle: body.handle?.trim() || null }
          : {}),
        ...(body.externalId !== undefined
          ? { externalId: body.externalId?.trim() || null }
          : {}),
        ...(body.pageUrl !== undefined
          ? { pageUrl: body.pageUrl?.trim() || null }
          : {}),
        ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.clearAccessToken
          ? { accessToken: null }
          : body.accessToken?.trim()
            ? { accessToken: encryptSecret(body.accessToken) }
            : {}),
        ...(body.clearApiKey
          ? { apiKey: null }
          : body.apiKey?.trim()
            ? { apiKey: encryptSecret(body.apiKey) }
            : {}),
      },
    });

    return NextResponse.json({ channel: serializeChannel(channel) });
  } catch (e) {
    console.error("[channels PATCH]", e);
    return NextResponse.json({ error: "Failed to update channel" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const limited = rateLimit(`channels-del:${req.headers.get("x-forwarded-for") || "local"}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id || !/^[a-z0-9]{10,40}$/i.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    await prisma.channel.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[channels DELETE]", e);
    return NextResponse.json({ error: "Failed to delete channel" }, { status: 500 });
  }
}
