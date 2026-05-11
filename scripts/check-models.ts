import { config } from "dotenv"; config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { modelLibrary, activityBinds } from "../db/schema";
import { eq } from "drizzle-orm";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function main() {
  const models = await db.select().from(modelLibrary);
  console.log("=== All Models ===");
  for (const m of models) console.log(`  ${m.openrouterModelId} | ${m.name}`);

  console.log("\n=== Grammar/Spelling Binds ===");
  for (const slug of ["detect-grammar", "detect-spelling"]) {
    const [bind] = await db.select().from(activityBinds).where(eq(activityBinds.slug, slug)).limit(1);
    if (bind) {
      console.log(`  ${slug}: modelId=${bind.modelId}, promptId=${bind.promptId}`);
      if (bind.modelId) {
        const [model] = await db.select().from(modelLibrary).where(eq(modelLibrary.id, bind.modelId)).limit(1);
        console.log(`    model: ${model?.openrouterModelId || "NOT FOUND"}`);
      }
    } else {
      console.log(`  ${slug}: NOT FOUND`);
    }
  }

  await client.end();
}

main().catch(console.error);
