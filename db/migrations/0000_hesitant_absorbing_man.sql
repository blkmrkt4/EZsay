CREATE TYPE "public"."ai_signal_level" AS ENUM('high', 'medium', 'low', 'none');--> statement-breakpoint
CREATE TYPE "public"."citation_status" AS ENUM('open', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."citation_style" AS ENUM('apa', 'mla', 'chicago', 'harvard', 'oxford', 'bluebook', 'oscola', 'business');--> statement-breakpoint
CREATE TYPE "public"."citation_user_action" AS ENUM('accepted', 'edited', 'verified', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('uploaded', 'scanning', 'scanned', 'editing', 'complete');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('academic', 'professional', 'casual', 'legal');--> statement-breakpoint
CREATE TYPE "public"."flag_status" AS ENUM('open', 'accepted', 'rejected', 'skipped', 'generation_failed');--> statement-breakpoint
CREATE TYPE "public"."library_category" AS ENUM('transition', 'corporate_fluff', 'hype_word', 'sentence_structure', 'density', 'burstiness', 'academic_pattern', 'emerging');--> statement-breakpoint
CREATE TYPE "public"."library_entry_type" AS ENUM('exact_phrase', 'regex_pattern', 'semantic_pattern');--> statement-breakpoint
CREATE TYPE "public"."library_severity" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."library_source" AS ENUM('manual', 'user_derived', 'ai_proposed');--> statement-breakpoint
CREATE TYPE "public"."library_status" AS ENUM('active', 'under_review', 'retired');--> statement-breakpoint
CREATE TYPE "public"."llm_outcome" AS ENUM('accepted', 'rejected', 'skipped', 'pending');--> statement-breakpoint
CREATE TYPE "public"."pattern_type" AS ENUM('banned_word', 'banned_structure', 'synonym_rotation', 'uniform_length', 'uniform_density', 'transition_pattern');--> statement-breakpoint
CREATE TYPE "public"."plagiarism_status" AS ENUM('open', 'dismissed', 'acknowledged');--> statement-breakpoint
CREATE TYPE "public"."plagiarism_verdict" AS ENUM('plagiarism', 'common_knowledge', 'coincidence', 'quotation', 'pending', 'error');--> statement-breakpoint
CREATE TYPE "public"."style_training_preference" AS ENUM('always_remove', 'always_keep', 'ask_each_time');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "activity_binds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"model_id" uuid,
	"fallback_model_id1" uuid,
	"fallback_model_id2" uuid,
	"prompt_id" uuid,
	"context_ids" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_binds_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "admin_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"raw_text" text NOT NULL,
	"style" "citation_style" NOT NULL,
	"structural_flags" jsonb,
	"verification_flags" jsonb,
	"status" "citation_status" DEFAULT 'open' NOT NULL,
	"user_action" "citation_user_action",
	"corrected_text" text
);
--> statement-breakpoint
CREATE TABLE "context_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source_type" text DEFAULT 'custom' NOT NULL,
	"content" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"context_text" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_label" text NOT NULL,
	"version_number" integer NOT NULL,
	"snapshot_text" text NOT NULL,
	"ai_risk_score" integer,
	"writing_quality_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"raw_text" text NOT NULL,
	"document_type" "document_type" NOT NULL,
	"status" "document_status" DEFAULT 'uploaded' NOT NULL,
	"ai_risk_score" integer,
	"writing_quality_score" integer,
	"last_rescore_at" timestamp with time zone,
	"last_scan_level" text,
	"last_scan_sensitivity" text,
	"last_scan_categories" jsonb,
	"last_scan_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flag_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flag_id" uuid NOT NULL,
	"text" text NOT NULL,
	"model_id" text NOT NULL,
	"is_blend" boolean DEFAULT false NOT NULL,
	"accepted" boolean
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"library_entry_id" uuid NOT NULL,
	"phrase_start" integer NOT NULL,
	"phrase_end" integer NOT NULL,
	"flagged_phrase" text NOT NULL,
	"pattern_type" "pattern_type" NOT NULL,
	"explanation" text NOT NULL,
	"status" "flag_status" DEFAULT 'open' NOT NULL,
	"accepted_option_id" uuid,
	"manual_replacement" text,
	"scan_run_id" text
);
--> statement-breakpoint
CREATE TABLE "library_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_type" "library_entry_type" NOT NULL,
	"value" text NOT NULL,
	"category" "library_category" NOT NULL,
	"severity" "library_severity" NOT NULL,
	"explanation" text NOT NULL,
	"document_types" text[] DEFAULT '{"all"}' NOT NULL,
	"status" "library_status" DEFAULT 'active' NOT NULL,
	"source" "library_source" DEFAULT 'manual' NOT NULL,
	"acceptance_rate" real DEFAULT 0,
	"flag_count" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_call_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_type" text NOT NULL,
	"model_used" text NOT NULL,
	"prompt_version_id" uuid,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"flag_id" uuid,
	"outcome" "llm_outcome" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_type" text NOT NULL,
	"primary_model" text NOT NULL,
	"fallback_model1" text NOT NULL,
	"fallback_model2" text NOT NULL,
	"temperature" real DEFAULT 0.7 NOT NULL,
	"max_tokens" integer DEFAULT 2048 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_configs_activity_type_unique" UNIQUE("activity_type")
);
--> statement-breakpoint
CREATE TABLE "model_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"openrouter_model_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"temperature" real DEFAULT 0.7 NOT NULL,
	"max_tokens" integer DEFAULT 2048 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plagiarism_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"scan_run_id" text,
	"section_id" uuid,
	"passage_text" text NOT NULL,
	"passage_start" integer NOT NULL,
	"passage_end" integer NOT NULL,
	"search_query" text NOT NULL,
	"search_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verdict" "plagiarism_verdict" DEFAULT 'pending' NOT NULL,
	"explanation" text,
	"confidence" real,
	"top_match_url" text,
	"top_match_title" text,
	"top_match_snippet" text,
	"status" "plagiarism_status" DEFAULT 'open' NOT NULL,
	"model_used" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"stripe_customer_id" text,
	"subscription_status" text DEFAULT 'none',
	"subscription_plan_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_type" text NOT NULL,
	"active_version_id" uuid,
	"model_config_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "prompt_configs_activity_type_unique" UNIQUE("activity_type")
);
--> statement-breakpoint
CREATE TABLE "prompt_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"system_prompt" text DEFAULT '' NOT NULL,
	"user_prompt" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_type" text NOT NULL,
	"name" text NOT NULL,
	"prompt_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"raw_text" text NOT NULL,
	"current_text" text NOT NULL,
	"ai_signal_level" "ai_signal_level" DEFAULT 'none' NOT NULL,
	"flag_count" integer DEFAULT 0 NOT NULL,
	"flags_resolved" integer DEFAULT 0 NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "style_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"document_type" "document_type" NOT NULL,
	"signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "style_training" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"item" text NOT NULL,
	"example" text,
	"notes" text,
	"preference" "style_training_preference" DEFAULT 'ask_each_time' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_options" ADD CONSTRAINT "flag_options_flag_id_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_library_entry_id_library_entries_id_fk" FOREIGN KEY ("library_entry_id") REFERENCES "public"."library_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;