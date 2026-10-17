"use client";

import Link from "next/link";
import { useApiQuery } from "@/lib/api/react";
import { useEventStream } from "@/lib/sse/use-event-stream";
import { useDesk } from "@/components/shell/desk-state";
import { useRole } from "@/components/roles/use-role";
import { useNow } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { waitingItems } from "./waiting";

/**
 * "Seni bekleyenler": the few things only you can move forward, each a plain sentence that
 * links to where you do it. Shown only when something waits for the role you look through.
 * If these lists cannot be read the section stays away; the desk's own ErrorState on Bugün
 * already says the server is unreachable.
 */
export function WaitingList({ className }: { className?: string }) {
  const { risk } = useDesk();
  const { can, user } = useRole();
  const now = useNow(30_000);
  const tickets = useApiQuery((api) => api.listTickets(), []);
  const limits = useApiQuery((api) => api.limits(), [risk?.as_of]);
  useEventStream("desk", {
    ticket: () => void tickets.refetch(),
    "limits.changed": () => void limits.refetch(),
  });

  const items = waitingItems({ can, uid: user.uid, tickets: tickets.data, now, limits: limits.data, risk });
  if (!items.length) return null;
  return (
    <section aria-labelledby="seni-bekleyenler" className={cn("animate-fade-in border-2 border-ink bg-panel px-4 py-4 sm:px-6", className)}>
      <h2 id="seni-bekleyenler" className="text-body font-semibold text-ink">
        Seni bekleyenler
      </h2>
      <ul className="mt-2 divide-y divide-hairline">
        {items.map((it) => (
          <li key={it.key}>
            <Link href={it.href} className="group flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-ui text-ink">
              <span>{it.text}</span>
              <span className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap text-brand">
                {it.place}
                <span aria-hidden className="inline-block transition-transform duration-[var(--dur-quick)] ease-[var(--ease-ink)] group-hover:translate-x-1">
                  →
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
