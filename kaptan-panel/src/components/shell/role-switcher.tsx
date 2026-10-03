"use client";

import { useId, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/session-context";
import { Role, ROLE_CODE, ROLE_LABEL } from "@/lib/domain/user";
import { cn } from "@/lib/utils";
import { notify } from "@/components/ui/toast";
import { switchRole } from "./session-actions";

/**
 * Mock-only role switcher (A R D U). Lets one presenter play the Admin and the Risk
 * Officer for the four-eyes demo steps. Never rendered in http mode.
 */
export function RoleSwitcher({ className }: { className?: string }) {
  const user = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const labelId = useId();

  const onPick = (role: Role) => {
    if (role === user.role) return;
    start(async () => {
      const r = await switchRole(role, pathname);
      if (!r.ok) {
        notify.error("Rol değiştirilemedi", "Oturum süresi dolmuş olabilir.");
        return;
      }
      notify.info(`Rol: ${ROLE_LABEL[role]}`, "Demo hesabı değişti (yalnızca mock).");
      router.push(r.next);
      router.refresh();
    });
  };

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between text-meta text-muted">
        <span id={labelId}>Rol değiştir (demo)</span>
        {pending ? <span>…</span> : null}
      </div>
      <div role="group" aria-labelledby={labelId} className="grid grid-cols-4 border-[1.5px] border-ink">
        {Role.options.map((r, i) => {
          const active = r === user.role;
          return (
            <button
              key={r}
              type="button"
              aria-pressed={active}
              aria-label={ROLE_LABEL[r]}
              title={ROLE_LABEL[r]}
              disabled={pending}
              onClick={() => onPick(r)}
              className={cn(
                "h-8 text-[13px] font-medium leading-none",
                i > 0 && "border-l border-ink",
                active ? "bg-ink text-on-dark" : "bg-panel text-ink hover:bg-wash-tint",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand disabled:opacity-60",
              )}
            >
              {ROLE_CODE[r]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
