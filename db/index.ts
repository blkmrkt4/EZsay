import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// In development, Next.js hot reload re-evaluates modules on every file change.
// Without a singleton, each reload creates a new postgres connection pool,
// quickly exhausting the database connection limit and causing 500 errors.
// The globalThis pattern survives HMR because globalThis persists across module re-evaluations.

const globalForDb = globalThis as unknown as {
  pgClient: ReturnType<typeof postgres> | undefined;
};

// DATABASE_URL must point at the Supabase TRANSACTION-mode pooler (port 6543).
// Session mode (5432) caps total clients at pool_size 15, shared across every
// Vercel instance AND local dev servers (one Supabase project for dev+prod) —
// a local test session can starve production into "max clients reached" 500s.
// Transaction mode multiplexes; prepare: false because transaction pooling
// does not guarantee prepared-statement support. Migrations/seeds keep a
// session-mode connection via DIRECT_DATABASE_URL (drizzle.config.ts).
const client = globalForDb.pgClient ?? postgres(connectionString, { max: 10, idle_timeout: 30, prepare: false });

if (process.env.NODE_ENV === "development") {
  globalForDb.pgClient = client;
}

export const db = drizzle(client, { schema });
