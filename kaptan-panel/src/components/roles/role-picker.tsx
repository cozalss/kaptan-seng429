"use client";

import { useState } from "react";
import { DropdownMenu as M } from "radix-ui";
import { ROLE_LABEL, ROLE_LINE, ROLES, memberForRole, type Role } from "@/lib/domain/role-meta";
import { cn } from "@/lib/utils";
import { MENU_CONTENT } from "@/components/ui/menu";
import { RoleEmblem } from "./role-emblem";
import { useRole } from "./use-role";

/**
 * "Kimin gözüyle bakıyorsun?" — one login, four roles. A small chip in the top bar; the menu
 * lists each role with one plain line. The choice is kept in the session. Each role wears the
 * tone and emblem of its door on /login, so the chip says at a glance whose eyes these are;
 * on a switch the tone ink cross-fades into the new role's.
 */
export function RolePicker({ testId = "role-picker" }: { testId?: string }) {
  const { role, switchTo, switching } = useRole();
  const [announcement, setAnnouncement] = useState("");

  const pick = async (next: Role) => {
    const ok = await switchTo(next);
    if (ok) setAnnouncement(`Şimdi ${ROLE_LABEL[next]} gözüyle bakıyorsun.`);
  };

  return (
    <>
      <M.Root modal={false}>
        <M.Trigger
          aria-label={`Rol: ${ROLE_LABEL[role]}. Kimin gözüyle bakıyorsun?`}
          aria-busy={switching || undefined}
          data-testid={testId}
          className={cn(
            `tone-${role}`,
            // The hit area is the bar's full height (44px on a phone); the drawn box is the left
            // half of the top bar's one instrument (role · ⚙), the role's tone inked along its foot.
            "group/chip inline-flex h-11 max-w-[184px] items-center outline-none sm:h-14",
            switching && "cursor-progress",
          )}
        >
          <span
            className={cn(
              "inline-flex h-9 min-w-0 items-center gap-2 border-2 border-r-0 border-rule-ui bg-panel pr-2 pl-2 text-dense text-ink shadow-[inset_0_-3px_0_var(--tone)]",
              "[transition-property:--tone,background-color,box-shadow] duration-[var(--dur-base)] ease-[var(--ease-ink)]",
              "group-hover/chip:bg-wash-tint group-data-[state=open]/chip:bg-wash-tint",
              "group-focus-visible/chip:outline-2 group-focus-visible/chip:outline-offset-2 group-focus-visible/chip:outline-brand",
            )}
          >
            <RoleEmblem role={role} className="size-[18px] shrink-0 text-[var(--tone)]" />
            <span className="truncate font-semibold text-[var(--tone)]">{ROLE_LABEL[role]}</span>
            <svg
              aria-hidden
              viewBox="0 0 10 10"
              className="size-2.5 shrink-0 text-ink-soft transition-transform duration-[var(--dur-quick)] ease-[var(--ease-ink)] group-data-[state=open]/chip:rotate-180"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path d="M2 4l3 3 3-3" />
            </svg>
          </span>
        </M.Trigger>
        <M.Portal>
          <M.Content align="end" sideOffset={2} className={cn(MENU_CONTENT, "w-[300px] max-w-[calc(100vw-24px)] py-2")}>
            <M.Label className="px-4 pt-1 pb-2 font-display-text text-lead text-ink">Kimin gözüyle bakıyorsun?</M.Label>
            <M.RadioGroup value={role} onValueChange={(v) => void pick(v as Role)}>
              {ROLES.map((r) => (
                <M.RadioItem
                  key={r}
                  value={r}
                  className={cn(`tone-${r}`, "group flex cursor-pointer gap-3 px-4 py-2.5 outline-none data-[highlighted]:bg-wash-tint",
                    "transition-colors duration-[var(--dur-instant)] data-[state=checked]:shadow-[inset_3px_0_0_var(--tone)]",
                  )}
                >
                  <span aria-hidden className="mt-[5px] grid size-[11px] shrink-0 place-items-center rounded-full border-2 border-ink">
                    <M.ItemIndicator className="size-[5px] rounded-full bg-ink" />
                  </span>
                  <RoleEmblem role={r} className="mt-px size-6 shrink-0 text-[var(--tone)]" />
                  <span className="min-w-0">
                    <span className="block text-ui font-medium text-ink">
                      {ROLE_LABEL[r]} <span className="font-normal text-muted">· {memberForRole(r).name}</span>
                    </span>
                    <span className="block text-dense text-ink-soft">{ROLE_LINE[r]}</span>
                  </span>
                </M.RadioItem>
              ))}
            </M.RadioGroup>
          </M.Content>
        </M.Portal>
      </M.Root>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </>
  );
}
