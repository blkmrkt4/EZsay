import type { NextConfig } from "next";

// Baseline security headers applied to every response. HSTS is already added by
// Vercel at the edge. A full Content-Security-Policy is intentionally omitted
// here — it needs per-route nonces to coexist with Next's inline scripts and is
// easy to misconfigure into an outage; add it as a follow-up hardening step.
const securityHeaders = [
  // Clickjacking protection. Safe to DENY: the app is never iframed, and both
  // Google OAuth and Stripe Checkout are full-page redirect flows.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
