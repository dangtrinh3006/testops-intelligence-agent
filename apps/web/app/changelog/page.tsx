import type { Metadata } from "next";
import { ChangelogView } from "@/components/pages/ChangelogView";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "What's new" };

export default function ChangelogPage() {
  return (
    <>
      <PageTitle title="What's new" eyebrow="Changelog">
        Product changes, newest first. Each entry links to the page it changed and to the commits behind it.
      </PageTitle>
      <ChangelogView />
    </>
  );
}
