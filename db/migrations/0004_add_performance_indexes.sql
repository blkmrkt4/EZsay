-- Performance indexes for high-frequency lookups
CREATE INDEX IF NOT EXISTS "documents_user_id_idx" ON "documents" ("user_id");
CREATE INDEX IF NOT EXISTS "sections_document_id_idx" ON "sections" ("document_id");
CREATE INDEX IF NOT EXISTS "flags_section_id_idx" ON "flags" ("section_id");
CREATE INDEX IF NOT EXISTS "citations_document_id_idx" ON "citations" ("document_id");
CREATE INDEX IF NOT EXISTS "plagiarism_results_document_id_idx" ON "plagiarism_results" ("document_id");
CREATE INDEX IF NOT EXISTS "library_entries_status_idx" ON "library_entries" ("status");
