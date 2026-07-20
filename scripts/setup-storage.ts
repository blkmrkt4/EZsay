/**
 * One-time idempotent setup of the private `originals` Supabase Storage
 * bucket, which holds the original uploaded files (docx/pdf/txt) at
 * {userId}/{docId}.{ext}. The .docx originals power formatting-preserving
 * export (lib/export/docx-surgery.ts).
 *
 * Run once per environment: npx tsx --env-file=.env.local scripts/setup-storage.ts
 */

import { createAdminClient, ORIGINALS_BUCKET } from "@/lib/supabase/admin";

async function main() {
  const supabase = createAdminClient();

  const { error } = await supabase.storage.createBucket(ORIGINALS_BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024, // matches the upload route's 10 MB cap
    allowedMimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/pdf",
      "text/plain",
    ],
  });

  if (error) {
    // "already exists" is success for an idempotent setup script
    if (/already exists/i.test(error.message)) {
      console.log(`= bucket "${ORIGINALS_BUCKET}" already exists`);
    } else {
      throw error;
    }
  } else {
    console.log(`+ created private bucket "${ORIGINALS_BUCKET}" (10MB cap, docx/pdf/txt)`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
