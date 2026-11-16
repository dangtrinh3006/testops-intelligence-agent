import { Suspense } from "react";
import { Console } from "@/components/console/Console";
import { AgentActivity } from "@/components/console/Hero";
import { ReleaseStrip } from "@/components/console/ReleaseStrip";
import { KpiRow, OverviewHeader, RecentRuns } from "@/components/pages/OverviewView";

export default function OverviewPage() {
  return (
    <>
      <OverviewHeader />
      <KpiRow />
      <ReleaseStrip />
      <div className="mb-10 grid gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-7">
          <RecentRuns />
        </div>
        <div className="min-w-0 xl:col-span-5">
          <AgentActivity />
        </div>
      </div>
      <section id="ask" aria-label="Ask the agent" className="scroll-mt-20">
        <Suspense fallback={null}>
          <Console />
        </Suspense>
      </section>
    </>
  );
}
