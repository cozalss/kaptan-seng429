"use client";

import { DropdownMenu as M } from "radix-ui";
import { ROLE_LABEL, ROLE_LINE, ROLES, memberForRole } from "@/lib/domain/user";
import { cn } from "@/lib/utils";
import { useRole } from "./use-role";

/**
 * "Kimin gözüyle bakıyorsun?" — one login, four roles. A small chip in the top bar; the menu
 * lists each role with one plain line. The choice is kept in the session.
 */
export function RolePicker() {
  const { role, switchTo, switching } = useRole();
  return (
    <M.Root modal={false}>
      <M.Trigger
        aria-label={`Rol: ${ROLE_LABEL[role]}. Kimin gözüyle bakıyorsun?`}
        data-testid="role-picker"
        className={cn(
          "ml-1 inline-flex h-8 max-w-[150px] items-center gap-1.5 border border-rule-soft px-2.5 text-[13px] text-ink transition-colors",
          "hover:border-ink hover:bg-wash-tint data-[state=open]:border-ink data-[state=open]:bg-wash-tint",
          switching && "opacity-60",
        )}
      >
        <span aria-hidden className="inline-block size-[6px] shrink-0 rotate-45 bg-wash" />
        <span className="truncate">{ROLE_LABEL[role]}</span>
        <svg aria-hidden viewBox="0 0 10 10" className="size-2.5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M2 4l3 3 3-3" />
        </svg>
      </M.Trigger>
      <M.Portal>
        <M.Content
          align="end"
          sideOffset={6}
          className="z-50 w-[300px] max-w-[calc(100vw-24px)] border-[1.5px] border-ink bg-panel py-2 shadow-ink data-[state=open]:animate-[page-in_160ms_var(--ease-ink)]"
        >
          <M.Label className="px-4 pt-1 pb-2 font-display text-[19px] leading-tight text-ink">Kimin gözüyle bakıyorsun?</M.Label>
          <p className="px-4 pb-2 text-[13px] leading-[18px] text-muted">Tek giriş, dört rol. Her rol yalnızca kendi işini yapabilir.</p>
          <M.RadioGroup value={role} onValueChange={(v) => void switchTo(v as typeof role)}>
            {ROLES.map((r) => (
              <M.RadioItem
                key={r}
                value={r}
                className="group flex cursor-pointer gap-3 px-4 py-2.5 outline-none data-[highlighted]:bg-wash-tint"
              >
                <span aria-hidden className="mt-[5px] grid size-[11px] shrink-0 place-items-center rounded-full border-[1.5px] border-ink">
                  <M.ItemIndicator className="size-[5px] rounded-full bg-ink" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium text-ink">
                    {ROLE_LABEL[r]} <span className="font-normal text-muted">· {memberForRole(r).name}</span>
                  </span>
                  <span className="block text-[13px] leading-[18px] text-ink-soft">{ROLE_LINE[r]}</span>
                </span>
              </M.RadioItem>
            ))}
          </M.RadioGroup>
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}
