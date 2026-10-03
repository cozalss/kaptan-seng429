"use client";

import { useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { DEMO_MODE } from "@/lib/api/config";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session-context";
import { can, deniedHint } from "@/lib/auth/permissions";
import { DEMO_SCENARIOS } from "@/mocks/ids";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/overlay";
import { notify } from "@/components/ui/toast";

/**
 * "Senaryo" menu (FRONTEND-SPEC §2.2, §7): Admin injects a demo fixture in demo mode.
 * Visible to every role so the demo is legible, but only D can run it (09 §5).
 */
export function ScenarioMenu() {
  const api = useApi();
  const router = useRouter();
  const user = useSession();
  if (!DEMO_MODE) return null;
  const allowed = can(user.role, "demo_inject");

  if (!allowed) {
    return (
      <Tooltip content={deniedHint("demo_inject")}>
        <span tabIndex={0} className="inline-flex">
          <Button size="sm" variant="outline" disabled aria-disabled>
            Senaryo
          </Button>
        </span>
      </Tooltip>
    );
  }

  const run = async (id: (typeof DEMO_SCENARIOS)[number]["id"], label: string) => {
    try {
      const r = await api.injectDemo(id);
      notify.event(`Senaryo: ${label}`, "DEMO FİKSTÜRÜ enjekte edildi; canlı akışa düşüyor.", r.run_id ? { label: "İzle", onClick: () => router.push(`/runs/${r.run_id}`) } : undefined);
    } catch (e) {
      notify.error("Senaryo çalıştırılamadı", errorMessage(e));
    }
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button size="sm" variant="secondary" aria-label="Senaryo menüsü (demo)">
          Senaryo
          <svg aria-hidden width="10" height="6" viewBox="0 0 10 6">
            <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[260px] border-[1.5px] border-ink bg-panel py-1 shadow-ink data-[state=open]:animate-ink-in"
        >
          <DropdownMenu.Label className="px-3 pt-1.5 pb-1 text-meta text-muted">Demo enjeksiyonu · DEMO FİKSTÜRÜ</DropdownMenu.Label>
          {DEMO_SCENARIOS.map((s) => (
            <DropdownMenu.Item
              key={s.id}
              onSelect={() => void run(s.id, s.label)}
              className="flex cursor-pointer items-baseline gap-3 px-3 py-2 text-dense text-ink outline-none data-[highlighted]:bg-wash-tint"
            >
              <span className="flex-1">{s.label}</span>
              <span className="text-meta text-muted">{s.step}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
