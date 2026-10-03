import type { Metadata, Viewport } from "next";
import { Gloock, Inter } from "next/font/google";
import { EARLY_INSTALL_SCRIPT } from "@/components/install/early-capture";
import { InstallPromptListener } from "@/components/install/install-prompt-listener";
import { Providers } from "@/components/layout/providers";
import { ServiceWorkerProvider } from "@/components/offline/service-worker-provider";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const gloock = Gloock({ variable: "--font-gloock", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "BentaTrack",
  description: "Inventory and sales management for Estetika",
  applicationName: "BentaTrack",
  appleWebApp: { capable: true, title: "BentaTrack", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#140e0b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes sets data-theme before paint, so the attribute differs from the server render.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${gloock.variable} h-full antialiased`}
    >
      <head>
        {/* Catches Chrome's one-time install offer before the app's scripts load (FR-061). */}
        <script dangerouslySetInnerHTML={{ __html: EARLY_INSTALL_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <InstallPromptListener />
        <ServiceWorkerProvider>
          <Providers>{children}</Providers>
        </ServiceWorkerProvider>
      </body>
    </html>
  );
}
