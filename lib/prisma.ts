import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 connects through a driver adapter. We pass the (pooled) Postgres
// connection string to the pg adapter.
//
// The client is created LAZILY, on first use, rather than at module import.
// `next build` imports every route module while collecting page data, so an
// eager client would demand DATABASE_URL at build time (and crash the build
// before any database is wired up). Deferring creation means the var is only
// required at runtime — exactly when a request actually touches the DB.
//
// Reuse a single PrismaClient across hot reloads (dev) and warm serverless
// invocations to avoid exhausting Postgres connections. Use a *pooled*
// connection string for DATABASE_URL in production (PgBouncer / Neon pooler).
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

// A lazy proxy: nothing is instantiated until the first property access (e.g.
// `prisma.presence`), which only happens inside a request handler at runtime.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
