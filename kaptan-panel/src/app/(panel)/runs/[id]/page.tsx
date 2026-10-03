import type { Metadata } from "next";
import { RunDetail } from "@/components/run/run-detail";

export const metadata: Metadata = { title: "Neden bu işlem?" };

/** /runs/[id] — "Neden bu işlem?" + agent trace (FRONTEND-SPEC §2.4, US-37, US-44, FR-31). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RunDetail key={id} runId={decodeURIComponent(id)} />;
}
