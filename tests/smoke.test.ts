import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("test database", () => {
  it("applies migrations", async () => {
    expect(await prisma.channel.count()).toBe(0);
  });
});
