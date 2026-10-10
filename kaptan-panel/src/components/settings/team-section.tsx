"use client";

import { ACTION_LABEL, ACTIONS, can } from "@/lib/auth/permissions";
import { ROLE_LABEL, ROLE_LINE, ROLES } from "@/lib/domain/user";
import { useApiQuery } from "@/lib/api/react";
import { cn } from "@/lib/utils";
import { SkeletonLines } from "@/components/ui/primitives";
import { Denied } from "@/components/roles/denied";
import { useRole } from "@/components/roles/use-role";

/**
 * Ekip ve roller — the team (Yönetici and Denetçi see it) and the "kim ne yapabilir" table,
 * generated from the same `can()` the API and every button use.
 */
export function TeamSection() {
  const { role, can: mayI } = useRole();
  const users = useApiQuery((api) => api.users(), []);

  return (
    <section aria-labelledby="ekip-baslik" id="ekip" className="scroll-mt-28 space-y-6">
      <div className="space-y-2">
        <h2 id="ekip-baslik" className="text-[13px] font-medium tracking-[0.04em] text-ink uppercase">
          Ekip ve roller
        </h2>
        <p className="max-w-[600px] text-[16px] leading-[25px] text-ink-soft">
          Tek giriş, dört rol. Her rol yalnızca kendi işini yapar; böylece hiçbir karar tek bir kişiye kalmaz.
        </p>
      </div>

      {mayI("users.view") ? (
        users.data ? (
          <ul aria-label="Kullanıcılar" className="divide-y divide-hairline border-y border-hairline">
            {users.data.map((m) => (
              <li key={m.uid} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 py-3">
                <span className="min-w-0">
                  <span className="block text-[16px] font-medium text-ink">{m.name}</span>
                  <span className="block text-[13px] text-muted">{m.duty_tr}</span>
                </span>
                <span className="text-right">
                  <span className="block text-[15px] text-ink">{ROLE_LABEL[m.role]}</span>
                  <span className="block text-[12px] text-muted">{ROLE_LINE[m.role]}</span>
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
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">Her rolün yapabildiği işler</caption>
          <thead>
            <tr className="border-b-[1.5px] border-ink">
              <th scope="col" className="w-[40%] py-2 pr-2 text-[12px] font-normal text-muted">
                İş
              </th>
              {ROLES.map((r) => (
                <th key={r} scope="col" className={cn("px-1 py-2 text-center text-[12px] leading-[15px] font-medium text-ink", r === role && "bg-wash-tint")}>
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ACTIONS.map((a) => (
              <tr key={a} className="border-b border-hairline">
                <th scope="row" className="py-2 pr-2 text-[14px] leading-[19px] font-normal text-ink">
                  {ACTION_LABEL[a]}
                </th>
                {ROLES.map((r) => (
                  <td key={r} className={cn("px-1 py-2 text-center text-[15px]", r === role && "bg-wash-tint")}>
                    {can(r, a) ? <span aria-label="evet">✓</span> : <span aria-label="hayır" className="text-rule-soft">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[13px] text-muted">Vurgulu sütun: şu an baktığın rol.</p>
      </div>
    </section>
  );
}
