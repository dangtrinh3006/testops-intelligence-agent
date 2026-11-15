import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0d14" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow"
        >
          Skip to content
        </a>
        <InspectorProvider>
          <Header />
          <main id="main" className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
            {children}
          </main>
          <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-faint sm:px-6 lg:px-8">
            Kestrel Commerce is a fictional company. All CI data on this site is synthetic. Read-only: nothing here can
            change CI, releases or the dataset.
          </footer>
        </InspectorProvider>
      </body>
    </html>
  );
}
