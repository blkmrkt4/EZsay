export const EVENT_CATALOG = {
  // Activation
  upload_completed:           "activation",
  intake_completed:           "activation",
  intake_skipped:             "activation",
  scan_started:               "activation",
  first_flag_accepted:        "activation",
  first_suggestion_generated: "activation",
  review_tab_opened:          "activation",

  // Value
  flag_accepted:              "value",
  flag_rejected:              "value",
  flag_skipped:               "value",
  scan_completed:             "value",

  // Retention
  document_created:           "retention",
  review_opened:              "retention",

  // Monetization
  limit_hit:                  "monetization",
  feature_used:               "monetization",
} as const;

export type EventName = keyof typeof EVENT_CATALOG;
