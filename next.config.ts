import type { NextConfig } from "next";

// Extra hostnames (comma-separated, no scheme or port) allowed to load the dev server, e.g. a
// LAN IP or an HTTPS tunnel for testing on a phone. Without this, Next blocks the page's JS for
// those hosts, the app never hydrates, and forms like login silently do nothing.
const devOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
  experimental: {
    serverActions: { allowedOrigins: devOrigins },
  },
};

export default nextConfig;
