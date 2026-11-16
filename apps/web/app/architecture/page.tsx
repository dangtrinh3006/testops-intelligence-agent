import type { Metadata } from "next";
import { ArchitectureView } from "@/components/pages/ArchitectureView";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Architecture" };

export default function ArchitecturePage() {
  return (
    <>
      <PageTitle
        eyebrow="How it works"
        title={
          <>
            A deterministic core with an agent that <em className="italic text-accent">explains</em>.
          </>
        }
      >
        The model chooses which evidence to fetch and writes the explanation. Counting, normalisation, flake levels and the release verdict are
        Python functions with their own tests.
      </PageTitle>
      <ArchitectureView />
    </>
  );
}
