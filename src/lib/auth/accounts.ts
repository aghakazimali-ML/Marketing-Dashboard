import { timingSafeEqual, createHash } from "node:crypto";
import type { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  createSessionToken,
  hashPassword,
  setSessionCookie,
  verifyPassword,
  type SessionRole,
} from "@/lib/auth/session";

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export type Account = {
  kind: "OWNER" | "MEMBER";
  id: string;
  email: string;
  name: string;
  role: SessionRole;
  isActive: boolean;
  passwordHash: string;
  sessionVersion: number;
};

export async function findAccountByEmail(emailInput: string): Promise<Account | null> {
  const email = emailInput.trim().toLowerCase();
  const owner = await prisma.dashboardOwner.findUnique({ where: { email } });
  if (owner) {
    return {
      kind: "OWNER", id: String(owner.id), email: owner.email, name: owner.name, role: "ADMIN",
      isActive: true, passwordHash: owner.passwordHash, sessionVersion: owner.sessionVersion,
    };
  }
  const member = await prisma.teamMember.findUnique({ where: { email } });
  if (!member) return null;
  return {
    kind: "MEMBER", id: member.id, email: member.email, name: member.name, role: member.role,
    isActive: member.isActive, passwordHash: member.passwordHash, sessionVersion: member.sessionVersion,
  };
}

export async function findAccountById(kind: "OWNER" | "MEMBER", id: string): Promise<Account | null> {
  if (kind === "OWNER") {
    const owner = await prisma.dashboardOwner.findUnique({ where: { id: Number(id) } });
    return owner ? findAccountByEmail(owner.email) : null;
  }
  const member = await prisma.teamMember.findUnique({ where: { id } });
  return member ? findAccountByEmail(member.email) : null;
}

let dummyHash: Promise<string> | undefined;

/** Verify against a throwaway hash when the account does not exist, so timing doesn't reveal it. */
export async function verifyAgainst(account: Account | null, password: string): Promise<boolean> {
  if (!account) {
    dummyHash ??= hashPassword("not-a-real-password-for-timing");
    await verifyPassword(password, await dummyHash);
    return false;
  }
  return verifyPassword(password, account.passwordHash);
}

export async function startSession(res: NextResponse, account: Account, signedInAt?: number) {
  const token = await createSessionToken(
    account.email,
    account.role,
    account.kind === "MEMBER" ? account.id : undefined,
    { sessionVersion: account.sessionVersion, signedInAt }
  );
  setSessionCookie(res, token);
}

/** Change a password and revoke every existing session for that account. */
export async function setPassword(account: Account, newPassword: string): Promise<number> {
  const passwordHash = await hashPassword(newPassword);
  if (account.kind === "OWNER") {
    const o = await prisma.dashboardOwner.update({
      where: { id: Number(account.id) },
      data: { passwordHash, sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });
    return o.sessionVersion;
  }
  const m = await prisma.teamMember.update({
    where: { id: account.id },
    data: { passwordHash, sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  return m.sessionVersion;
}

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  return null;
}

/** Constant-time string comparison (hashes first so lengths never leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export { safeNextPath } from "@/lib/auth/paths";
