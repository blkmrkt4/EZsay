import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  real,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ── Enums ──────────────────────────────────────────────────────────────────

export const documentTypeEnum = pgEnum("document_type", [
  "academic",
  "professional",
  "casual",
  "legal",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "uploaded",
  "scanning",
  "scanned",
  "editing",
  "complete",
]);

export const aiSignalLevelEnum = pgEnum("ai_signal_level", [
  "high",
  "medium",
  "low",
  "none",
]);

export const flagStatusEnum = pgEnum("flag_status", [
  "open",
  "accepted",
  "rejected",
  "skipped",
  "generation_failed",
]);

export const patternTypeEnum = pgEnum("pattern_type", [
  "banned_word",
  "banned_structure",
  "synonym_rotation",
  "uniform_length",
  "uniform_density",
  "transition_pattern",
  "ai_artifact",
  "writing_quality",
  "plagiarism_match",
  "tone_inconsistency",
  "spelling_error",
  "grammar_error",
]);

export const citationStyleEnum = pgEnum("citation_style", [
  "apa",
  "mla",
  "chicago",
  "harvard",
  "oxford",
  "bluebook",
  "oscola",
  "business",
]);

export const citationStatusEnum = pgEnum("citation_status", [
  "open",
  "resolved",
  "dismissed",
]);

export const citationUserActionEnum = pgEnum("citation_user_action", [
  "accepted",
  "edited",
  "verified",
  "dismissed",
]);

export const libraryEntryTypeEnum = pgEnum("library_entry_type", [
  "exact_phrase",
  "regex_pattern",
  "semantic_pattern",
]);

export const libraryCategoryEnum = pgEnum("library_category", [
  "transition",
  "corporate_fluff",
  "hype_word",
  "sentence_structure",
  "density",
  "burstiness",
  "academic_pattern",
  "emerging",
  "citation_artifact",
]);

export const librarySeverityEnum = pgEnum("library_severity", [
  "high",
  "medium",
  "low",
]);

export const libraryStatusEnum = pgEnum("library_status", [
  "active",
  "under_review",
  "retired",
]);

export const librarySourceEnum = pgEnum("library_source", [
  "manual",
  "user_derived",
  "ai_proposed",
]);

export const llmOutcomeEnum = pgEnum("llm_outcome", [
  "accepted",
  "rejected",
  "skipped",
  "pending",
]);

// ── Profiles ───────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // matches auth.users.id
  email: text("email"),
  role: userRoleEnum("role").notNull().default("user"),
  stripeCustomerId: text("stripe_customer_id"),
  // Subscription resource ID on Stripe (sub_xxx). Used to call Stripe APIs
  // for this user (cancel, retrieve, update). Distinct from
  // subscriptionPlanId which holds the active Price ID.
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status").default("none"),
  subscriptionPlanId: text("subscription_plan_id"),
  subscriptionPeriodEnd: timestamp("subscription_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Library Entries ────────────────────────────────────────────────────────

export const libraryEntries = pgTable("library_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  entryType: libraryEntryTypeEnum("entry_type").notNull(),
  value: text("value").notNull(),
  category: libraryCategoryEnum("category").notNull(),
  severity: librarySeverityEnum("severity").notNull(),
  explanation: text("explanation").notNull(),
  documentTypes: text("document_types").array().notNull().default(["all"]),
  status: libraryStatusEnum("status").notNull().default("active"),
  source: librarySourceEnum("source").notNull().default("manual"),
  acceptanceRate: real("acceptance_rate").default(0),
  flagCount: integer("flag_count").notNull().default(0),
  notes: text("notes"),
  addedBy: uuid("added_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("library_entries_status_idx").on(t.status),
]);

// ── Documents ──────────────────────────────────────────────────────────────

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  title: text("title").notNull(),
  rawText: text("raw_text").notNull(),
  documentType: documentTypeEnum("document_type").notNull(),
  status: documentStatusEnum("status").notNull().default("uploaded"),
  aiRiskScore: integer("ai_risk_score"),
  writingQualityScore: integer("writing_quality_score"),
  aiArtifactScore: integer("ai_artifact_score"),
  citationsScore: integer("citations_score"),
  toneConsistencyScore: integer("tone_consistency_score"),
  plagiarismScore: integer("plagiarism_score"),
  spellingResults: jsonb("spelling_results"),
  grammarResults: jsonb("grammar_results"),
  extractionMeta: jsonb("extraction_meta"),
  intake: jsonb("intake"),  // questionnaire answers: audience, purpose, aiUsage, discipline, etc.
  spellingScore: integer("spelling_score"),
  grammarScore: integer("grammar_score"),
  lastRescoreAt: timestamp("last_rescore_at", { withTimezone: true }),
  lastScanLevel: text("last_scan_level"),
  lastScanSensitivity: text("last_scan_sensitivity"),
  lastScanCategories: jsonb("last_scan_categories"),
  lastScanAt: timestamp("last_scan_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("documents_user_id_idx").on(t.userId),
]);

// ── Document Versions ──────────────────────────────────────────────────────

export const documentVersions = pgTable("document_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  versionLabel: text("version_label").notNull(), // e.g. "MyEssay-Apr17-26.1"
  versionNumber: integer("version_number").notNull(),
  snapshotText: text("snapshot_text").notNull(), // full document text at this point
  aiRiskScore: integer("ai_risk_score"),
  writingQualityScore: integer("writing_quality_score"),
  aiArtifactScore: integer("ai_artifact_score"),
  citationsScore: integer("citations_score"),
  toneConsistencyScore: integer("tone_consistency_score"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Sections ───────────────────────────────────────────────────────────────

export const sections = pgTable("sections", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  index: integer("index").notNull(),
  rawText: text("raw_text").notNull(),
  currentText: text("current_text").notNull(),
  aiSignalLevel: aiSignalLevelEnum("ai_signal_level").notNull().default("none"),
  flagCount: integer("flag_count").notNull().default(0),
  flagsResolved: integer("flags_resolved").notNull().default(0),
  isLocked: boolean("is_locked").notNull().default(false),
}, (t) => [
  index("sections_document_id_idx").on(t.documentId),
]);

// ── Flags ──────────────────────────────────────────────────────────────────

export const flags = pgTable("flags", {
  id: uuid("id").defaultRandom().primaryKey(),
  sectionId: uuid("section_id")
    .notNull()
    .references(() => sections.id, { onDelete: "cascade" }),
  libraryEntryId: uuid("library_entry_id")
    .references(() => libraryEntries.id),
  phraseStart: integer("phrase_start").notNull(),
  phraseEnd: integer("phrase_end").notNull(),
  flaggedPhrase: text("flagged_phrase").notNull(),
  patternType: patternTypeEnum("pattern_type").notNull(),
  explanation: text("explanation").notNull(),
  status: flagStatusEnum("status").notNull().default("open"),
  acceptedOptionId: uuid("accepted_option_id"),
  manualReplacement: text("manual_replacement"),
  scanRunId: text("scan_run_id"),
  metadata: jsonb("metadata"),
}, (t) => [
  index("flags_section_id_idx").on(t.sectionId),
]);

// ── Flag Options ───────────────────────────────────────────────────────────

export const flagOptions = pgTable("flag_options", {
  id: uuid("id").defaultRandom().primaryKey(),
  flagId: uuid("flag_id")
    .notNull()
    .references(() => flags.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  modelId: text("model_id").notNull(),
  isBlend: boolean("is_blend").notNull().default(false),
  accepted: boolean("accepted"),
});

// ── Citations ──────────────────────────────────────────────────────────────

export const citations = pgTable("citations", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  rawText: text("raw_text").notNull(),
  style: citationStyleEnum("style").notNull(),
  // Citation graph: what kind of object this row is. Reference-list entries
  // are the verifiable unit; inline citations and quotes are stored only
  // when they carry findings (e.g. no matching entry, orphan quote).
  entryType: text("entry_type").notNull().default("reference_entry"), // 'reference_entry' | 'inline' | 'quote'
  linkedCitationId: uuid("linked_citation_id"), // inline/quote → its reference_entry row
  contextSentence: text("context_sentence"),    // surrounding sentence for inline/quote rows
  structuralFlags: jsonb("structural_flags"),
  verificationFlags: jsonb("verification_flags"),
  status: citationStatusEnum("status").notNull().default("open"),
  userAction: citationUserActionEnum("user_action"),
  correctedText: text("corrected_text"),
}, (t) => [
  index("citations_document_id_idx").on(t.documentId),
]);

// ── Style Profiles ─────────────────────────────────────────────────────────

export const styleProfiles = pgTable("style_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  documentType: documentTypeEnum("document_type").notNull(),
  signals: jsonb("signals").notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Admin: Prompt Configs ──────────────────────────────────────────────────

export const promptConfigs = pgTable("prompt_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  activityType: text("activity_type").notNull().unique(),
  activeVersionId: uuid("active_version_id"),
  modelConfigId: uuid("model_config_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid("updated_by"),
});

// ── Admin: Prompt Versions ─────────────────────────────────────────────────

export const promptVersions = pgTable("prompt_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  activityType: text("activity_type").notNull(),
  name: text("name").notNull(),
  promptText: text("prompt_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by"),
});

// ── Admin: Context Versions ────────────────────────────────────────────────

export const contextVersions = pgTable("context_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  contextText: text("context_text").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid("created_by"),
});

// ── Admin: Model Configs ───────────────────────────────────────────────────

export const modelConfigs = pgTable("model_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  activityType: text("activity_type").notNull().unique(),
  primaryModel: text("primary_model").notNull(),
  fallbackModel1: text("fallback_model1").notNull(),
  fallbackModel2: text("fallback_model2").notNull(),
  temperature: real("temperature").notNull().default(0.7),
  maxTokens: integer("max_tokens").notNull().default(2048),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Admin: Model Library ──────────────────────────────────────────────────
// Each entry is an OpenRouter model given a friendly name and description.

export const modelLibrary = pgTable("model_library", {
  id: uuid("id").defaultRandom().primaryKey(),
  openrouterModelId: text("openrouter_model_id").notNull(), // e.g. "anthropic/claude-sonnet-4-20250514"
  name: text("name").notNull(),                              // your label, e.g. "Gemma low tokens, moderate temp"
  description: text("description"),                          // what you use it for
  temperature: real("temperature").notNull().default(0.7),
  maxTokens: integer("max_tokens").notNull().default(2048),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Admin: Prompt Library ─────────────────────────────────────────────────
// Each entry is a named pair of system prompt + user prompt.

export const promptLibrary = pgTable("prompt_library", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),                // your label, e.g. "Surface scan prompt v3"
  description: text("description"),
  systemPrompt: text("system_prompt").notNull().default(""),
  userPrompt: text("user_prompt").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Admin: Context Library ────────────────────────────────────────────────
// Each entry is a named context resource — either uploaded content or a
// pointer to a system resource (ContextLLM, phrase library).

export const contextLibrary = pgTable("context_library", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),                // your label, e.g. "Phrase library (all categories)"
  description: text("description"),
  sourceType: text("source_type").notNull().default("custom"), // "custom", "context_llm", "phrase_library"
  content: text("content"),                     // file content for custom, null for system pointers
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Admin: Style Training ─────────────────────────────────────────────────
// Formatting artifacts the user controls: Always Remove, Always Keep, Ask Me Each Time.

export const styleTrainingPreferenceEnum = pgEnum("style_training_preference", [
  "always_remove",
  "always_keep",
  "ask_each_time",
]);

export const styleTraining = pgTable("style_training", {
  id: uuid("id").defaultRandom().primaryKey(),
  category: text("category").notNull(),          // e.g. "punctuation", "emojis", "structural", etc.
  item: text("item").notNull(),                   // e.g. "Em dashes"
  example: text("example"),                       // e.g. "—"
  notes: text("notes"),                           // e.g. "The signature AI tell"
  preference: styleTrainingPreferenceEnum("preference").notNull().default("ask_each_time"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── User Style Preferences ────────────────────────────────────────────────
// Explicit style rules a user sets (citation format, indentation, etc.)
// One row per user per document type. documentType = null means universal.

export const userStylePreferences = pgTable("user_style_preferences", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  documentType: documentTypeEnum("document_type"),
  preferences: jsonb("preferences").notNull().default({}),
  wizardCompletedAt: timestamp("wizard_completed_at", { withTimezone: true }),
  styleGuideFileUrl: text("style_guide_file_url"),
  styleGuideParsedAt: timestamp("style_guide_parsed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("user_style_prefs_user_doctype_idx").on(t.userId, t.documentType),
]);

// ── User Artifact Overrides ───────────────────────────────────────────────
// Per-user overrides of global styleTraining preferences.

export const userArtifactOverrides = pgTable("user_artifact_overrides", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  styleTrainingId: uuid("style_training_id").notNull()
    .references(() => styleTraining.id, { onDelete: "cascade" }),
  preference: styleTrainingPreferenceEnum("preference").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("user_artifact_override_idx").on(t.userId, t.styleTrainingId),
]);

// ── Admin: Activity Binds ──────────────────────────────────────────────────
// A bind ties a slug to selections from the three libraries above.
// System slugs are auto-populated and cannot be deleted.

export const activityBinds = pgTable("activity_binds", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),              // machine name, e.g. "surface-scan"
  name: text("name").notNull(),                        // human label, e.g. "Surface Scan"
  description: text("description"),                    // what this activity does
  isSystem: boolean("is_system").notNull().default(false), // true = auto-populated, can't delete
  isActive: boolean("is_active").notNull().default(true),

  // References to the three libraries (selected by dropdown)
  modelId: uuid("model_id"),                           // FK → model_library (primary)
  fallbackModelId1: uuid("fallback_model_id1"),        // FK → model_library (fallback 1)
  fallbackModelId2: uuid("fallback_model_id2"),        // FK → model_library (fallback 2)
  promptId: uuid("prompt_id"),                         // FK → prompt_library
  contextIds: jsonb("context_ids").default([]),         // array of context_library IDs

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Admin: Settings (key-value) ───────────────────────────────────────────

export const adminSettings = pgTable("admin_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Admin Recovery Codes ──────────────────────────────────────────────────

export const adminRecoveryCodes = pgTable("admin_recovery_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  codeHash: text("code_hash").notNull(),
  used: boolean("used").notNull().default(false),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Usage Tracking ────────────────────────────────────────────────────────

export const usageTracking = pgTable(
  "usage_tracking",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    yearMonth: text("year_month").notNull(), // "2026-04"
    wordsScanned: integer("words_scanned").notNull().default(0),
    scanCount: integer("scan_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // Required by recordScanUsage's ON CONFLICT (user_id, year_month) DO UPDATE upsert.
  (t) => [
    uniqueIndex("usage_tracking_user_month_unique").on(t.userId, t.yearMonth),
  ],
);

// ── Admin: LLM Call Log ────────────────────────────────────────────────────

export const llmCallLog = pgTable("llm_call_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  activityType: text("activity_type").notNull(),
  modelUsed: text("model_used").notNull(),
  promptVersionId: uuid("prompt_version_id"),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  flagId: uuid("flag_id"),
  outcome: llmOutcomeEnum("outcome").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Analytics Events ─────────────────────────────────────────────────────

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id"),
  eventName: text("event_name").notNull(),
  category: text("category").notNull(),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("events_name_idx").on(t.eventName),
  index("events_user_id_idx").on(t.userId),
  index("events_created_at_idx").on(t.createdAt),
]);

// ── Plagiarism Results ────────────────────────────────────────────────────

export const plagiarismVerdictEnum = pgEnum("plagiarism_verdict", [
  "plagiarism",
  "close_match",
  "cited",           // attributed paraphrase — proper academic practice, not an issue
  "common_knowledge",
  "coincidence",
  "quotation",
  "pending",
  "error",
]);

export const plagiarismStatusEnum = pgEnum("plagiarism_status", [
  "open",
  "dismissed",
  "acknowledged",
]);

export const plagiarismResults = pgTable("plagiarism_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").notNull(),
  scanRunId: text("scan_run_id"),
  sectionId: uuid("section_id"),
  passageText: text("passage_text").notNull(),
  passageStart: integer("passage_start").notNull(),
  passageEnd: integer("passage_end").notNull(),
  searchQuery: text("search_query").notNull(),
  searchResults: jsonb("search_results").notNull().default([]),
  verdict: plagiarismVerdictEnum("verdict").notNull().default("pending"),
  explanation: text("explanation"),
  confidence: real("confidence"),
  topMatchUrl: text("top_match_url"),
  topMatchTitle: text("top_match_title"),
  topMatchSnippet: text("top_match_snippet"),
  status: plagiarismStatusEnum("status").notNull().default("open"),
  modelUsed: text("model_used"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("plagiarism_results_document_id_idx").on(t.documentId),
]);
