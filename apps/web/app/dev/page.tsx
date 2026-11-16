import type { Metadata } from "next";
import { Suspense } from "react";
import { DevView } from "@/components/pages/DevView";
import { LoadingBlock, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Developer workspace" };

export default function DevPage() {
  return (
    <>
      <PageTitle title="Developer workspace" eyebrow="Shift left · before merge">
        Did my change break it? Each failing test on a commit is attributed to the change, to known flakiness or to infrastructure, with the PR check and CI
        gate that the same policy would produce.
      </PageTitle>
      <Suspense fallback={<LoadingBlock rows={4} label="Loading commits" />}>
        <DevView />
      </Suspense>
    </>
  );
}
