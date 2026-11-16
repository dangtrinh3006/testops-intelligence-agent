import type { Metadata } from "next";
import { Suspense } from "react";
import { Console } from "@/components/console/Console";
import { AgentActivity } from "@/components/console/Hero";
import { ReleaseStrip } from "@/components/console/ReleaseStrip";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { KpiRow, OverviewHeader, RecentRuns } from "@/components/pages/OverviewView";

export const metadata: Metadata = { title: { absolute: "Release overview · TestOps Intelligence Agent" } };

export default function OverviewPage() {
  return (
    <>
      <OverviewHeader />
      <OnboardingChecklist />
      <KpiRow />
      <ReleaseStrip />
      <div className="mb-8">
        <RecentRuns />
      </div>
      <div className="mb-10">
        <AgentActivity />
      </div>
      <section id="ask" aria-label="Ask the agent" className="scroll-mt-20">
        <Suspense fallback={null}>
          <Console />
        </Suspense>
      </section>
    </>
  );
}
