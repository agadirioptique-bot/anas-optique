import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Baseline security headers on every response (SPEC §11 phase 13). No CSP yet: Supabase
// (REST, Realtime wss, Storage signed URLs) and Next's inline scripts would need nonces.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The prescription photo uses <input capture>, which needs no camera permission for the page.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Keep the dev badge clear of the sidebar "collapse" button.
  devIndicators: { position: "bottom-right" },
  headers: async () => [{ source: "/:path*", headers: SECURITY_HEADERS }],
};

export default withNextIntl(nextConfig);
