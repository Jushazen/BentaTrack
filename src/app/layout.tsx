import type { Metadata, Viewport } from "next";
import { Gloock, Inter } from "next/font/google";
import { Providers } from "@/components/layout/providers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const gloock = Gloock({ variable: "--font-gloock", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "BentaTrack",
  description: "Inventory and sales management for Estetika",
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
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
