import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthConfigured } from "@/lib/auth/session";

export async function GET() {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const status = dbOk ? 200 : 503;
  return NextResponse.json(
    {
      status: dbOk ? "ok" : "degraded",
      db: dbOk,
      authConfigured: isAuthConfigured(),
      time: new Date().toISOString(),
    },
    { status }
  );
}
