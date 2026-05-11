import { config } from "dotenv"; config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { modelLibrary } from "../db/schema";
import { eq } from "drizzle-orm";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function main() {
  const [updated] = await db
    .update(modelLibrary)
    .set({ openrouterModelId: "anthropic/claude-sonnet-4" })
    .where(eq(modelLibrary.name, "Claude Sonnet — Grammar & Spelling"))
    .returning();

  if (updated) {
    console.log(`Fixed model ID: ${updated.openrouterModelId} (${updated.name})`);
  } else {
    console.log("Model not found");
  }

  await client.end();
}

main().catch(console.error);
