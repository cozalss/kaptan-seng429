"use client";

import { ACTION_LABEL, ACTIONS, can } from "@/lib/auth/permissions";
import { ROLE_LABEL, ROLES, type Role } from "@/lib/domain/user";
import { useApiQuery } from "@/lib/api/react";
import { cn } from "@/lib/utils";
import { SkeletonLines } from "@/components/ui/primitives";
import { Denied } from "@/components/roles/denied";
import { RoleEmblem } from "@/components/roles/role-emblem";
import { useRole } from "@/components/roles/use-role";
import { CARD, SectionTitle, TH } from "@/components/portfolio/kit";

/** Column heads short enough for a phone; the full name is still read out. */
const SHORT: Readonly<Record<Role, string>> = { analyst: "Analist", risk_officer: "Risk", admin: "Yönetici", auditor: "Denetçi" };

/**
 * Ekip ve roller — the team (Yönetici and Denetçi see it) and the "Kim ne yapabilir?" table,
 * generated from the same `can()` the API and every button use.
 */
export function TeamSection() {
  const { role, can: mayI } = useRole();
  const mayView = mayI("users.view");
  // Only roles that may see the team ask for it (GET /admin/users is 403 for the others, API.md §3).
  const users = useApiQuery((api) => (mayView ? api.users() : Promise.resolve([])), [mayView]);

  return (
    <section aria-labelledby="ekip-baslik" id="ekip" className="space-y-6">
      <div className={CARD}>
        <SectionTitle id="ekip-baslik" title="Ekip ve roller" className="px-4 pt-4 pb-3 sm:px-6 sm:pt-5">
          Dört rol; her biri yalnızca kendi işini yapar, hiçbir karar tek kişiye kalmaz.
        </SectionTitle>
        {mayView ? (
          users.data ? (
            <table aria-label="Kullanıcılar" className="w-full border-collapse text-left">
              <thead>
                <tr className="border-y-2 border-hairline">
                  <th scope="col" className={cn(TH, "py-2.5 pr-3 pl-4 sm:pl-6")}>
                    Ad
                  </th>
                  <th scope="col" className={cn(TH, "hidden px-3 py-2.5 sm:table-cell")}>
                    Görev
                  </th>
                  <th scope="col" className={cn(TH, "py-2.5 pr-4 pl-3 sm:pr-6")}>
                    Rol
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.data.map((m) => (
                  <tr key={m.uid} className="border-b border-hairline last:border-b-0">
                    <th scope="row" className="py-3 pr-3 pl-4 text-left font-normal sm:pl-6">
                      <span className="block text-ui font-semibold text-ink">{m.name}</span>
                      <span className="block text-dense text-muted sm:hidden">{m.duty_tr}</span>
                    </th>
                    <td className="hidden px-3 py-3 text-dense text-ink-soft sm:table-cell">{m.duty_tr}</td>
                    <td className="py-3 pr-4 pl-3 sm:pr-6">
                      <span className={cn(`tone-${m.role}`, "inline-flex items-center gap-1.5 text-ui text-ink")}>
                        <RoleEmblem role={m.role} className="size-[14px] shrink-0 text-[var(--tone)]" />
                        {ROLE_LABEL[m.role]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <SkeletonLines lines={4} className="px-4 pb-5 sm:px-6" />
          )
        ) : (
          <Denied action="users.view" className="border-t-2 border-hairline px-4 py-4 sm:px-6" />
        )}
      </div>

      <div className={CARD}>
        <SectionTitle title="Kim ne yapabilir?" className="px-4 pt-4 pb-3 sm:px-6 sm:pt-5">
          Vurgulu sütun: şu an baktığın rol.
        </SectionTitle>
        <table className={cn(`tone-${role}`, "w-full table-fixed border-collapse text-left")}>
          <caption className="sr-only">Her rolün yapabildiği işler</caption>
          <thead>
            <tr className="border-y-2 border-hairline">
              <th scope="col" className={cn(TH, "w-[40%] py-2.5 pr-2 pl-4 sm:pl-6")}>
                İş
              </th>
              {ROLES.map((r) => (
                <th key={r} scope="col" className={cn(TH, "px-1 py-2.5 text-center text-ink", r === role && "bg-[var(--tone-tint)] shadow-[inset_0_3px_0_var(--tone)]")}>
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
              <tr key={a} className="border-b border-hairline last:border-b-0 hover:bg-wash-tint">
                <th scope="row" className="py-2.5 pr-2 pl-4 text-dense font-normal text-ink sm:pl-6">
                  {ACTION_LABEL[a]}
                </th>
                {ROLES.map((r) => (
                  <td key={r} className={cn("px-1 py-2.5 text-center text-ui", r === role && "bg-[var(--tone-tint)]")}>
                    {can(r, a) ? (
                      <span role="img" aria-label="evet" className="font-semibold text-gain">
                        ✓
                      </span>
                    ) : (
                      <span role="img" aria-label="hayır" className="text-rule-soft">
                        —
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
