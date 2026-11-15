import type { Metadata } from "next";
import { EvalsView } from "@/components/pages/EvalsView";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Agent evals" };

export default function EvalsPage() {
  return (
    <>
      <PageTitle title="How we test the agent" eyebrow="Agent evals">
        The agent is tested like any other release-critical component: fixed scenarios with expected verdicts, adversarial inputs, and grounding
        checks on every answer.
      </PageTitle>
      <EvalsView />
    </>
  );
}
