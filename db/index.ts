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

const client = globalForDb.pgClient ?? postgres(connectionString, { max: 10, idle_timeout: 30 });

if (process.env.NODE_ENV === "development") {
  globalForDb.pgClient = client;
}

export const db = drizzle(client, { schema });
