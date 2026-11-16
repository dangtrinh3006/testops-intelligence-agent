import type { Metadata } from "next";
import { TriageView } from "@/components/pages/TriageView";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Triage inbox" };

export default function TriagePage() {
  return (
    <>
      <PageTitle title="Triage inbox" eyebrow="Quality engineering">
        Every test that failed or retried in the window, with its defect type and a suggested action. Accept or override each one; export the decisions.
      </PageTitle>
      <TriageView />
    </>
  );
}
