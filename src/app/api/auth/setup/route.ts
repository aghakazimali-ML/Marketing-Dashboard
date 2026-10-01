import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const owner = await prisma.dashboardOwner.findUnique({
      where: { id: 1 },
      select: { id: true },
    });
    return NextResponse.json({ setupComplete: Boolean(owner) });
  } catch {
    return NextResponse.json(
      { error: "Account setup status is unavailable." },
      { status: 503 }
    );
  }
}