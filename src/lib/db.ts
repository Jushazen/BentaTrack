// Prisma client singleton using the node-postgres driver adapter (required by Prisma 7).
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export type { Prisma } from "@/generated/prisma/client";
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

function createClient(connectionString: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Reuse one client across hot reloads in dev so connections don't pile up.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = createClient(url);
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  return client;
}

/** Shared Prisma client. Created on first use so builds don't need a database. */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
