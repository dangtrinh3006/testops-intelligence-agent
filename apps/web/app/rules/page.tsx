import type { Metadata } from "next";
import { RulesView } from "@/components/pages/RulesView";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Rules" };

export default function RulesPage() {
  return (
    <>
      <PageTitle title="Expert knowledge layer — versioned, reviewable, customer-owned" eyebrow="Rules">
        The rules decide; the language model only chooses which evidence to fetch and explains the result. Changing a rule is a reviewed change
        to a file, not a prompt edit.
      </PageTitle>
      <RulesView />
    </>
  );
}
