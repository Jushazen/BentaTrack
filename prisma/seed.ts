// Seeds the first Owner account and starter categories. Safe to run more than once:
// existing records are left alone, so a password the owner has changed is never reset.
// Run with: npm run db:seed   (reads SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD from .env)
import { pathToFileURL } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";

dotenv.config({ quiet: true });

export const STARTER_CATEGORIES = ["Bags", "Accessories", "Perfumes"] as const;
export const BCRYPT_ROUNDS = 12;

export type SeedOptions = { ownerEmail?: string; ownerPassword?: string; ownerName?: string };
export type SeedReport = { ownerCreated: boolean; categoriesCreated: number };

export async function seed(prisma: PrismaClient, options: SeedOptions): Promise<SeedReport> {
  const email = options.ownerEmail?.trim().toLowerCase();
  const password = options.ownerPassword ?? "";
  if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw new Error("SEED_OWNER_EMAIL must be set to a valid email address");
  }
  if (password.length < 8) throw new Error("SEED_OWNER_PASSWORD must be at least 8 characters");

  let ownerCreated = false;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        name: options.ownerName ?? "Owner",
        role: "OWNER",
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      },
    });
    ownerCreated = true;
  }

  const { count: categoriesCreated } = await prisma.category.createMany({
    data: STARTER_CATEGORIES.map((name) => ({ name })),
    skipDuplicates: true,
  });

  return { ownerCreated, categoriesCreated };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const report = await seed(prisma, {
      ownerEmail: process.env.SEED_OWNER_EMAIL,
      ownerPassword: process.env.SEED_OWNER_PASSWORD,
    });
    console.log(
      `Seed done: owner ${report.ownerCreated ? "created" : "already existed"}, ` +
        `${report.categoriesCreated} new categor${report.categoriesCreated === 1 ? "y" : "ies"}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
