import bcrypt from "bcryptjs";
import { beforeEach, expect, test } from "vitest";
import { db } from "@/lib/db";
import { STARTER_CATEGORIES, seed } from "../../../prisma/seed";
import { resetTestDatabase } from "../helpers/db";

const OPTIONS = { ownerEmail: "Owner@Estetika.Local", ownerPassword: "first-password-123" };

beforeEach(resetTestDatabase);

test("[SEED-1] seed creates the owner (lowercase email, hashed password) and starter categories", async () => {
  const report = await seed(db, OPTIONS);
  expect(report).toEqual({ ownerCreated: true, categoriesCreated: STARTER_CATEGORIES.length });

  const owner = await db.user.findUniqueOrThrow({ where: { email: "owner@estetika.local" } });
  expect(owner.role).toBe("OWNER");
  expect(owner.active).toBe(true);
  expect(owner.passwordHash).not.toContain("first-password-123");
  expect(await bcrypt.compare("first-password-123", owner.passwordHash)).toBe(true);

  const names = (await db.category.findMany({ orderBy: { name: "asc" } })).map((c) => c.name);
  expect(names).toEqual([...STARTER_CATEGORIES].sort());
});

test("[SEED-2] running the seed again changes nothing and never resets the owner's password", async () => {
  await seed(db, OPTIONS);
  const before = await db.user.findUniqueOrThrow({ where: { email: "owner@estetika.local" } });

  const report = await seed(db, { ...OPTIONS, ownerPassword: "a-different-password" });
  expect(report).toEqual({ ownerCreated: false, categoriesCreated: 0 });

  const after = await db.user.findUniqueOrThrow({ where: { email: "owner@estetika.local" } });
  expect(after.passwordHash).toBe(before.passwordHash);
  expect(await db.user.count()).toBe(1);
  expect(await db.category.count()).toBe(STARTER_CATEGORIES.length);
});

test("[SEED-1] seed refuses a missing email or a short password", async () => {
  await expect(seed(db, { ownerPassword: "long-enough-pw" })).rejects.toThrow(/SEED_OWNER_EMAIL/);
  await expect(seed(db, { ownerEmail: "o@x.ph", ownerPassword: "short" })).rejects.toThrow(
    /at least 8/,
  );
  expect(await db.user.count()).toBe(0);
});
