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
    <section aria-labelledby="seni-bekleyenler" className={cn("animate-fade-in space-y-3", className)}>
      <h2 id="seni-bekleyenler" className="label">
        Seni bekleyenler
      </h2>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.key}>
            <Link href={it.href} className="group inline-flex min-h-11 flex-wrap items-baseline gap-x-2 py-2 text-ui text-ink-soft hover:text-ink sm:min-h-0 sm:py-1">
              <span className="underline decoration-rule-ui underline-offset-4 group-hover:decoration-ink">{it.text}</span>
              <span className="whitespace-nowrap text-ink">
                <span aria-hidden className="inline-block transition-transform duration-[var(--dur-quick)] ease-[var(--ease-ink)] group-hover:translate-x-1">
                  →
                </span>{" "}
                {it.place}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
