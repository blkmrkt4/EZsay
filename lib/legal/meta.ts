/**
 * Company / contact details referenced by the legal pages (Terms, Privacy,
 * Refund). These are scaffold defaults — fill in the real legal entity name,
 * jurisdiction, and a monitored contact address before relying on these pages
 * for a public launch. Everything user-facing reads from here, so this is the
 * only file you need to edit.
 */
export const LEGAL_META = {
  productName: "EzSay",
  // The legal entity that operates EzSay (sole trader name or registered company).
  // TODO: replace with the real operating entity.
  companyName: "EzSay",
  // Where you are established — drives the governing-law clause.
  // TODO: replace with your actual jurisdiction, e.g. "England and Wales".
  jurisdiction: "[your jurisdiction]",
  // A monitored inbox for legal / privacy / billing enquiries.
  // TODO: replace with a real, monitored address.
  contactEmail: "support@ezsay.byzyb.ai",
  siteUrl: "https://ezsay.byzyb.ai",
  // Shown as "Last updated" on every legal page.
  lastUpdated: "4 June 2026",
} as const;
