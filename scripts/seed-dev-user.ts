/**
 * Seeds a dev user into the profiles table for local development.
 * Run: npx tsx scripts/seed-dev-user.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { profiles } from "../db/schema";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function seed() {
  await db
    .insert(profiles)
    .values({
      id: "00000000-0000-0000-0000-000000000001",
      email: "dev@ezsay.local",
      role: "admin",
    })
    .onConflictDoNothing();

  console.log("Dev user seeded (admin role).");
  await client.end();
}

seed().catch(console.error);
