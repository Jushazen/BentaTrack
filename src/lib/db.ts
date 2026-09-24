// Prisma client singleton using the node-postgres driver adapter (required by Prisma 7).
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export type { Prisma } from "@/generated/prisma/client";
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

function createClient(connectionString: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// One client per process (kept on globalThis so dev hot reloads reuse it too). Every client has
// its own connection pool, so creating one per access would exhaust the database's connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  globalForPrisma.prisma = createClient(url);
  return globalForPrisma.prisma;
}

/** Shared Prisma client. Created on first use so builds don't need a database. */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
