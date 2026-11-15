import type { Metadata } from "next";
import { DataQualityView } from "@/components/pages/DataQualityView";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Data quality" };

export default function DataQualityPage() {
  return (
    <>
      <PageTitle title="Data quality" eyebrow="Found during ingest, reported, never imputed">
        Real CI data is messy: duplicate webhooks, attempts that never report, mixed timestamp formats, inconsistent status words. Each issue is
        a finding with the records it affects, so a verdict built on that data can say what it could not verify.
      </PageTitle>
      <DataQualityView />
    </>
  );
}
