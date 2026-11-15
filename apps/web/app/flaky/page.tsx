import type { Metadata } from "next";
import { FlakyView } from "@/components/pages/FlakyView";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Flaky tests" };

export default function FlakyPage() {
  return (
    <>
      <PageTitle title="Flaky tests" eyebrow="Evidence levels, not guesses">
        Flakiness is graded by evidence: only the same commit producing both a final PASS and a final FAIL proves it. Infrastructure retries are
        counted separately and never raise a test&apos;s level.
      </PageTitle>
      <FlakyView />
    </>
  );
}
