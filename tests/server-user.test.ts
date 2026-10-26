import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createSessionToken, hashPassword, SESSION_COOKIE } from "@/lib/auth/session";

// The root layout reads the session from the request cookies; stand in for next/headers here.
let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === SESSION_COOKIE && cookieValue ? { value: cookieValue } : undefined) }),
}));

import { getServerUser } from "@/lib/auth/authorization";

beforeEach(async () => {
  cookieValue = undefined;
  await prisma.teamMember.deleteMany();
  await prisma.dashboardOwner.deleteMany();
  await prisma.dashboardOwner.create({ data: { id: 1, name: "O", email: "own@x.com", passwordHash: await hashPassword("correct-horse-battery") } });
});

describe("getServerUser (server-rendered sidebar)", () => {
  it("returns the signed-in owner as an administrator", async () => {
    cookieValue = await createSessionToken("own@x.com", "ADMIN", undefined, { sessionVersion: 0 });
    expect(await getServerUser()).toEqual({ email: "own@x.com", role: "ADMIN" });
  });

  it("returns null without a cookie, with a garbage cookie, or after the session was invalidated", async () => {
    expect(await getServerUser()).toBeNull();
    cookieValue = "not-a-jwt";
    expect(await getServerUser()).toBeNull();
    cookieValue = await createSessionToken("own@x.com", "ADMIN", undefined, { sessionVersion: 7 });
    expect(await getServerUser()).toBeNull();
  });

  it("uses the role stored for a team member and rejects a disabled one", async () => {
    const m = await prisma.teamMember.create({
      data: { name: "A", email: "analyst@x.com", role: "ANALYST", passwordHash: await hashPassword("correct-horse-battery"), isActive: true },
    });
    cookieValue = await createSessionToken("analyst@x.com", "ADMIN", m.id, { sessionVersion: m.sessionVersion });
    expect(await getServerUser()).toEqual({ email: "analyst@x.com", role: "ANALYST" });
    await prisma.teamMember.update({ where: { id: m.id }, data: { isActive: false } });
    expect(await getServerUser()).toBeNull();
  });
});
