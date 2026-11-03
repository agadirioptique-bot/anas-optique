import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep the dev badge clear of the sidebar "collapse" button.
  devIndicators: { position: "bottom-right" },
};

export default withNextIntl(nextConfig);
