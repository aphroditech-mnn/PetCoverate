import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 reads migration/introspection connection details from here (the
// schema no longer holds a `url`). The Prisma CLI does not auto-load .env, so
// load it manually (Node 20.12+ ships process.loadEnvFile).
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // .env is optional (e.g. on Vercel where vars are injected directly).
}

// `prisma generate` runs during the production build and is pure codegen — it
// needs the schema, not a live connection. So fall back to a placeholder when
// DATABASE_URL isn't set at build time instead of hard-failing the whole build.
// The real URL is required at runtime (see lib/prisma.ts, which throws if it's
// missing) and for `prisma db push`, both of which actually open a connection.
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: databaseUrl,
  },
});
