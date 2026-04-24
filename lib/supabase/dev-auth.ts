/**
 * Dev-only auth bypass. In development, creates a deterministic dev user
 * so you never have to log in to test the app.
 *
 * Activated when DEV_BYPASS_AUTH=true in .env.local
 */

const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";
const DEV_USER_EMAIL = "dev@ezsay.local";

export function isDevBypass(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.DEV_BYPASS_AUTH === "true"
  );
}

export function getDevUser() {
  return {
    id: DEV_USER_ID,
    email: DEV_USER_EMAIL,
    role: "authenticated" as const,
  };
}