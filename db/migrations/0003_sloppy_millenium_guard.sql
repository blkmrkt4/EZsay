ALTER TYPE "public"."plagiarism_verdict" ADD VALUE 'close_match' BEFORE 'common_knowledge';--> statement-breakpoint
CREATE TABLE "admin_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"event_name" text NOT NULL,
	"category" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_tracking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"year_month" text NOT NULL,
	"words_scanned" integer DEFAULT 0 NOT NULL,
	"scan_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_artifact_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"style_training_id" uuid NOT NULL,
	"preference" "style_training_preference" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_style_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"document_type" "document_type",
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"wizard_completed_at" timestamp with time zone,
	"style_guide_file_url" text,
	"style_guide_parsed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "plagiarism_score" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "extraction_meta" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "intake" jsonb;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "subscription_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_artifact_overrides" ADD CONSTRAINT "user_artifact_overrides_style_training_id_style_training_id_fk" FOREIGN KEY ("style_training_id") REFERENCES "public"."style_training"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_name_idx" ON "events" USING btree ("event_name");--> statement-breakpoint
CREATE INDEX "events_user_id_idx" ON "events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "events_created_at_idx" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_tracking_user_month_unique" ON "usage_tracking" USING btree ("user_id","year_month");--> statement-breakpoint
CREATE UNIQUE INDEX "user_artifact_override_idx" ON "user_artifact_overrides" USING btree ("user_id","style_training_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_style_prefs_user_doctype_idx" ON "user_style_preferences" USING btree ("user_id","document_type");--> statement-breakpoint
CREATE INDEX "citations_document_id_idx" ON "citations" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "documents_user_id_idx" ON "documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "flags_section_id_idx" ON "flags" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "library_entries_status_idx" ON "library_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "plagiarism_results_document_id_idx" ON "plagiarism_results" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "sections_document_id_idx" ON "sections" USING btree ("document_id");