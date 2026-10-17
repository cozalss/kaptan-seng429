"use client";

import { deniedReason, roleThatCan, type Action } from "@/lib/auth/permissions";
import { ROLE_LABEL } from "@/lib/domain/role-meta";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useRole } from "./use-role";

/**
 * The plain reason a control is closed for your role, never a dead end: "Bunu Risk Sorumlusu
 * yapar." plus a quiet link to look through that role's eyes. The dot wears the tone ink of
 * the role that CAN do it. Renders nothing when allowed.
 */
export function Denied({ action, className }: { action: Action; className?: string }) {
  const { role, can, switchTo, switching } = useRole();
  if (can(action)) return null;
  const target = roleThatCan(action);
  return (
    <p
      data-testid={`denied-${action}`}
      className={cn("flex flex-wrap items-center gap-x-3 text-ui text-ink-soft", target && `tone-${target}`, className)}
    >
      <span>
        <span aria-hidden className={cn("mr-1.5 inline-block size-[6px] -translate-y-[2px] rounded-full", target ? "bg-[var(--tone)]" : "bg-ink-soft")} />
        {deniedReason(action, role)}
      </span>
      {target ? (
        <Button variant="link" disabled={switching} pending={switching} onClick={() => void switchTo(target)} className="text-ui">
          {ROLE_LABEL[target]} gözüyle bak →
        </Button>
      ) : null}
    </p>
  );
}
