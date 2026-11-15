import { Console } from "@/components/console/Console";
import { ReleaseStrip } from "@/components/console/ReleaseStrip";

export default function ConsolePage() {
  return (
    <>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-faint">Kestrel Commerce · release console</div>
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">CI triage and release readiness</h1>
        </div>
        <p className="max-w-xl border-l-2 border-ink/70 pl-3 text-sm text-muted">
          We are not asking you to trust an AI to make release decisions.{" "}
          <span className="font-medium text-ink">Rules decide, the model explains, every claim links to a record.</span>
        </p>
      </div>
      <ReleaseStrip />
      <Console />
    </>
  );
}
