import type { Metadata } from "next";
import { HistoryView } from "@/components/pages/HistoryView";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Test history" };

export default function HistoryPage() {
  return (
    <>
      <PageTitle title="Test history" eyebrow="Every cell is an attempt, not a summary">
        Forty runs per service, one column each. Colour is the outcome rebuilt from raw attempts; the dot above each column is the release gate&apos;s
        verdict for that run. Click any cell to open its evidence.
      </PageTitle>
      <HistoryView />
    </>
  );
}
