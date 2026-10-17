"use client";

import { ACTION_LABEL, ACTIONS, can } from "@/lib/auth/permissions";
import { ROLE_LABEL, ROLE_LINE, ROLES, type Role } from "@/lib/domain/user";
import { useApiQuery } from "@/lib/api/react";
import { cn } from "@/lib/utils";
import { SkeletonLines } from "@/components/ui/primitives";
import { Denied } from "@/components/roles/denied";
import { RoleEmblem } from "@/components/roles/role-emblem";
import { useRole } from "@/components/roles/use-role";
import { SECTION, SectionHead } from "./section-nav";

/** Column heads short enough for a phone; the full name is still read out. */
const SHORT: Readonly<Record<Role, string>> = { analyst: "Analist", risk_officer: "Risk", admin: "Yönetici", auditor: "Denetçi" };

/**
 * Ekip ve roller — the team (Yönetici and Denetçi see it) and the "kim ne yapabilir" table,
 * generated from the same `can()` the API and every button use.
 */
export function TeamSection() {
  const { role, can: mayI } = useRole();
  const users = useApiQuery((api) => api.users(), []);

  return (
    <section aria-labelledby="ekip-baslik" id="ekip" {...SECTION}>
      <SectionHead id="ekip-baslik" title="Ekip ve roller">
        Tek giriş, dört rol. Her rol yalnızca kendi işini yapar; böylece hiçbir karar tek bir kişiye kalmaz.
      </SectionHead>

      {mayI("users.view") ? (
        users.data ? (
          <ul aria-label="Kullanıcılar" className="divide-y divide-hairline border-y-2 border-ink">
            {users.data.map((m) => (
              <li key={m.uid} className={cn(`tone-${m.role}`, "grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline")}>
                <span className="min-w-0">
                  <span className="block text-[16px] font-medium text-ink">{m.name}</span>
                  <span className="block text-dense text-muted">{m.duty_tr}</span>
                </span>
                <span className="sm:text-right">
                  <span className="flex items-center gap-1.5 text-ui text-ink sm:justify-end">
                    <RoleEmblem role={m.role} className="size-[14px] shrink-0 text-[var(--tone)]" />
                    {ROLE_LABEL[m.role]}
                  </span>
                  <span className="block text-meta text-muted">{ROLE_LINE[m.role]}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <SkeletonLines lines={4} />
        )
      ) : (
        <Denied action="users.view" />
      )}

      <div className="space-y-2">
        <h3 className="text-[16px] font-medium text-ink">Kim ne yapabilir?</h3>
        <table className={cn(`tone-${role}`, "w-full table-fixed border-collapse text-left")}>
          <caption className="sr-only">Her rolün yapabildiği işler</caption>
          <thead>
            <tr className="border-b-2 border-ink">
              <th scope="col" className="w-[40%] py-2 pr-2 text-meta font-medium text-ink-soft">
                İş
              </th>
              {ROLES.map((r) => (
                <th key={r} scope="col" className={cn("px-1 py-2 text-center text-meta font-medium text-ink", r === role && "bg-[var(--tone-tint)] shadow-[inset_0_3px_0_var(--tone)]")}>
                  <span aria-hidden className="sm:hidden">
                    {SHORT[r]}
                  </span>
                  <span className="max-sm:sr-only">{ROLE_LABEL[r]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ACTIONS.map((a) => (
              <tr key={a} className="border-b border-hairline transition-colors duration-[var(--dur-instant)] hover:bg-wash-tint">
                <th scope="row" className="py-2 pr-2 text-dense font-normal text-ink">
                  {ACTION_LABEL[a]}
                </th>
                {ROLES.map((r) => (
                  <td key={r} className={cn("px-1 py-2 text-center font-sans text-ui", r === role && "bg-[var(--tone-tint)]")}>
                    {can(r, a) ? (
                      <span role="img" aria-label="evet" className="font-semibold text-ink">
                        ✓
                      </span>
                    ) : (
                      <span role="img" aria-label="hayır" className="text-rule-ui">
                        —
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-dense text-muted">Vurgulu sütun: şu an baktığın rol.</p>
      </div>
    </section>
  );
}
