import type { Metadata } from "next";
import { DocsView } from "@/components/pages/DocsView";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Docs" };

export default function DocsPage() {
  return (
    <>
      <PageTitle title="Documentation" eyebrow="User guide">
        How to read a release decision, find the evidence behind it, and use the agent from your own workflow.
      </PageTitle>
      <DocsView />
    </>
  );
}
