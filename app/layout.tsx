import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "kit-deploy", template: "%s · kit-deploy" },
  description: "Panel privado de despliegues de kit-deploy.",
  // Private dashboard: never indexed (next.config.ts also sends X-Robots-Tag).
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "dark light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: THEME_SCRIPT sets data-theme on <html> before React hydrates.
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant from lib/theme.ts, no input
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
