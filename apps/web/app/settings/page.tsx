import type { Metadata } from "next";
import { SettingsView } from "@/components/pages/SettingsView";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Settings & integrations" };

export default function SettingsPage() {
  return (
    <>
      <PageTitle title="Settings & integrations" eyebrow="Platform">
        What this deployment is actually running, read from the API at runtime: model chain, data source, rules and integrations. Nothing here is
        editable in the sandbox, and no credential is ever shown.
      </PageTitle>
      <SettingsView />
    </>
  );
}
