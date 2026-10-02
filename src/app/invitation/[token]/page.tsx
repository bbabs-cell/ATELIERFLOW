import type { Metadata } from "next";
import { InvitationView } from "@/features/team/InvitationView";

export const metadata: Metadata = {
  title: "Invitation — Atelier",
  description: "Rejoindre un atelier sur invitation.",
  robots: { index: false, follow: false },
};

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InvitationView token={token} />;
}
