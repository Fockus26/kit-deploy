import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { EnrolFlow } from "./enrol-flow";

export const metadata: Metadata = {
  title: "Alta",
  // The enrolment token rides in the fragment; no referrer ever carries this page's URL.
  referrer: "no-referrer",
};

export default function EnrolPage() {
  return (
    <AuthShell>
      <EnrolFlow />
    </AuthShell>
  );
}
