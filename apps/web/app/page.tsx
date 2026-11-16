import { Console } from "@/components/console/Console";
import { Hero } from "@/components/console/Hero";
import { ReleaseStrip } from "@/components/console/ReleaseStrip";
import { Eyebrow } from "@/components/ui";

export default function ConsolePage() {
  return (
    <>
      <Hero />
      <ReleaseStrip />
      <Eyebrow as="p" className="mb-4">
        Ask the agent
      </Eyebrow>
      <Console />
    </>
  );
}
