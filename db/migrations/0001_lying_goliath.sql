ALTER TYPE "public"."pattern_type" ADD VALUE 'ai_artifact';--> statement-breakpoint
ALTER TYPE "public"."pattern_type" ADD VALUE 'writing_quality';--> statement-breakpoint
ALTER TYPE "public"."pattern_type" ADD VALUE 'plagiarism_match';--> statement-breakpoint
ALTER TYPE "public"."pattern_type" ADD VALUE 'tone_inconsistency';--> statement-breakpoint
ALTER TYPE "public"."pattern_type" ADD VALUE 'spelling_error';--> statement-breakpoint
ALTER TYPE "public"."pattern_type" ADD VALUE 'grammar_error';--> statement-breakpoint
ALTER TABLE "flags" ALTER COLUMN "library_entry_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "ai_artifact_score" integer;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "citations_score" integer;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "tone_consistency_score" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ai_artifact_score" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "citations_score" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "tone_consistency_score" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "spelling_results" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "grammar_results" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "spelling_score" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "grammar_score" integer;--> statement-breakpoint
ALTER TABLE "flags" ADD COLUMN "metadata" jsonb;