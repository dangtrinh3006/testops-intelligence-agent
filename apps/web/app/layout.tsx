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
import { Header } from "@/components/Header";
import { InspectorProvider } from "@/components/Inspector";

export const metadata: Metadata = {
  title: { default: "TestOps Intelligence Agent", template: "%s · TestOps Intelligence Agent" },
  description:
    "Evidence-first agent for CI failure triage, flaky-test analysis and release readiness. Synthetic data, proof of concept.",
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
          <Header />
          <main id="main" className="mx-auto w-full max-w-[1200px] px-4 pb-20 pt-8 sm:px-6 sm:pt-10 lg:px-8">
            {children}
          </main>
          <footer className="border-t border-line">
            <div className="mx-auto flex max-w-[1200px] flex-col gap-2 px-4 py-6 font-mono text-[11px] leading-relaxed text-faint sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
              <span>
                Kestrel Commerce is a fictional company. All CI data on this site is synthetic. Read-only: nothing here can change CI, releases or
                the dataset.
              </span>
              <span className="shrink-0 uppercase tracking-[0.1em] text-accent">Synthetic data · Proof of concept</span>
            </div>
          </footer>
        </InspectorProvider>
      </body>
    </html>
  );
}
