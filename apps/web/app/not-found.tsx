import Link from "next/link";
import { PageTitle } from "@/components/ui";

export default function NotFound() {
  return (
    <>
      <PageTitle title="Page not found" />
      <Link href="/" className="text-sm text-accent underline underline-offset-2">
        Back to the console
      </Link>
    </>
  );
}
