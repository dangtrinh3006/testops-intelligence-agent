import type { Metadata } from "next";
import { FleetView } from "@/components/pages/FleetView";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Agent fleet & connectors" };

export default function FleetPage() {
  return (
    <>
      <PageTitle title="Agent fleet & connectors" eyebrow="Platform · control plane">
        QE connectors run inside the customer&apos;s network and only call out over HTTPS: no inbound ports, no VPN. Enrol them with a one-time code, watch
        heartbeats and version drift, pull policy, and stop pushes with a per-connector or workspace kill switch. Every action is audited.
      </PageTitle>
      <FleetView />
    </>
  );
}
