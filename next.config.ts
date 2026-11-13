import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isDev = process.env.NODE_ENV !== "production";
// Vercel preview deployments show the Vercel toolbar (vercel.live).
const isPreview = process.env.VERCEL_ENV === "preview";

/** The Supabase project the browser talks to (REST, Auth, Storage signed URLs, Realtime). */
function supabaseOrigins(): { http: string; ws: string } {
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
    return { http: origin, ws: origin.replace(/^http/, "ws") };
  } catch {
    return { http: "https://*.supabase.co", ws: "wss://*.supabase.co" };
  }
}

/**
 * Content-Security-Policy (SPEC §11, security review 2). Static, without nonces: scripts and styles
 * only from this site (+ the inline scripts Next and next-themes need), network calls only to this
 * site and the Supabase project, images also from Supabase Storage (prescription photos) and
 * data:/blob: (photo preview). No plugins, no framing, forms post only here. A nonce-based
 * `script-src` (dropping 'unsafe-inline') is the next step, see docs/SECURITY-REVIEW.md.
 * Zod runs jitless in the browser (src/instrumentation-client.ts), so production needs no eval.
 */
function contentSecurityPolicy(): string {
  const supabase = supabaseOrigins();
  const vercel = isPreview ? " https://vercel.live" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${vercel}`,
    `style-src 'self' 'unsafe-inline'${vercel}`,
    `img-src 'self' data: blob: ${supabase.http}${isPreview ? " https://vercel.live https://vercel.com" : ""}`,
    `font-src 'self' data:${isPreview ? " https://vercel.live https://assets.vercel.com" : ""}`,
    `connect-src 'self' ${supabase.http} ${supabase.ws}${isDev ? " ws: wss:" : ""}${isPreview ? " https://vercel.live wss://ws-us3.pusher.com" : ""}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    `frame-src ${isPreview ? "https://vercel.live" : isDev ? "'self'" : "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
  ].join("; ");
}

// Security headers on every response (SPEC §11 phase 13 + security review 2).
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Other sites opened from here (WhatsApp, Storage links) get no handle on this window.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
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
