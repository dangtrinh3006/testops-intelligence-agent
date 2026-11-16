import type { Metadata } from "next";
import { PilotView } from "@/components/pages/PilotView";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Pilot" };

export default function PilotPage() {
  return (
    <>
      <PageTitle
        eyebrow="Pilot proposal · for the budget owner"
        title={
          <>
            A measured, read-only pilot. A human <em className="italic text-accent">accepts or overrides</em> every item.
          </>
        }
      >
        Four weeks, one CI source, one service. Week one pays for itself even if you stop: a measured baseline and a data-quality report on your
        CI feeds.
      </PageTitle>
      <PilotView />
    </>
  );
}
