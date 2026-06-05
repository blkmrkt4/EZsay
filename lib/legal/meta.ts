/**
 * Company / contact details referenced by the legal pages (Terms, Privacy,
 * Refund). Everything user-facing reads from here, so this is the only file
 * to edit when these details change.
 */
export const LEGAL_META = {
  productName: "EzSay",
  // The legal entity that operates EzSay.
  companyName: "Painkiller Labs Inc Inc",
  // Where the entity is established — drives the governing-law clause.
  jurisdiction: "Ontario, Canada",
  // A monitored inbox for legal / privacy / billing enquiries.
  // Must be able to RECEIVE mail (ezsay.byzyb.ai is send-only) — this is on
  // the byzyb.ai Google Workspace domain.
  contactEmail: "ezsay@byzyb.ai",
  siteUrl: "https://ezsay.byzyb.ai",
  // Shown as "Last updated" on every legal page.
  lastUpdated: "5 June 2026",
} as const;
