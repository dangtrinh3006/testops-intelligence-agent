import type { Metadata } from "next";
import { AuditView } from "@/components/pages/AuditView";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditPage() {
  return (
    <>
      <PageTitle title="Audit log" eyebrow="Governance">
        Every agent answer, human decision and control-plane action, newest first.
      </PageTitle>
      <AuditView />
    </>
  );
}
