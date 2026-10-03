import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/authorization";

export async function GET(req: NextRequest) {
  const session = await getCurrentSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ email: session.email, role: session.role });
}
