import type { Metadata, Viewport } from "next";
import "@fontsource/playfair-display/latin-400.css";
import "@fontsource/playfair-display/latin-400-italic.css";
import "@fontsource/playfair-display/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { InspectorProvider } from "@/components/Inspector";

export const metadata: Metadata = {
  title: { default: "TestOps Intelligence Agent", template: "%s · TestOps Intelligence Agent" },
  description:
    "Evidence-first release intelligence: CI failure triage, flaky-test analysis and release readiness, with every claim linked to a record.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#14100b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-[3px] focus:border focus:border-accent focus:bg-surface focus:px-3 focus:py-2 focus:text-accent"
        >
          Skip to content
        </a>
        <InspectorProvider>
          <AppShell>{children}</AppShell>
        </InspectorProvider>
      </body>
    </html>
  );
}
