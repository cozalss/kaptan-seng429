"use client";

import { deniedReason, roleThatCan, type Action } from "@/lib/auth/permissions";
import { ROLE_LABEL } from "@/lib/domain/user";
import { cn } from "@/lib/utils";
import { useRole } from "./use-role";

/**
 * The plain reason a control is closed for your role, never a dead end: "Bunu Risk Sorumlusu
 * yapar." plus a quiet link to look through that role's eyes. Renders nothing when allowed.
 */
export function Denied({ action, className }: { action: Action; className?: string }) {
  const { role, can, switchTo, switching } = useRole();
  if (can(action)) return null;
  const target = roleThatCan(action);
  return (
    <p data-testid={`denied-${action}`} className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[15px] leading-[22px] text-ink-soft", className)}>
      <span>
        <span aria-hidden className="mr-1.5 inline-block size-[7px] -translate-y-[1px] rotate-45 border border-ink-soft" />
        {deniedReason(action, role)}
      </span>
      {target ? (
        <button
          type="button"
          disabled={switching}
          onClick={() => void switchTo(target)}
          className="text-[14px] text-ink underline decoration-rule-soft underline-offset-4 hover:decoration-ink disabled:opacity-45"
        >
          {ROLE_LABEL[target]} gözüyle bak →
        </button>
      ) : null}
    </p>
  );
}
