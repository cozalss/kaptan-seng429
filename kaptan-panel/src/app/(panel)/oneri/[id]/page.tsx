import type { Metadata } from "next";
import { ProposalScreen } from "@/components/proposal/proposal-screen";

export const metadata: Metadata = { title: "Öneri" };

/** /oneri/[id] — one proposal, told as a short story, and your decision. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProposalScreen proposalId={decodeURIComponent(id)} />;
}
