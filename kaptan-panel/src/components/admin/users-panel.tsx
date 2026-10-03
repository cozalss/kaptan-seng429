"use client";

import { Role, ROLE_CODE, ROLE_LABEL } from "@/lib/domain/user";
import { useApiQuery } from "@/lib/api/react";
import { useSession } from "@/lib/auth/session-context";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { ErrorState, SkeletonLines } from "@/components/ui/primitives";
import { permissionMatrix, SOD_RULES } from "./admin-logic";

/** Users and roles (09 §5): who exists, which role, TOTP; the permission matrix from code. */
export function UsersPanel() {
  const me = useSession();
  const users = useApiQuery((a) => a.adminUsers(), []);
  const matrix = permissionMatrix();
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Panel aria-labelledby="users-title">
          <PanelHeader id="users-title" title="Kullanıcılar" meta="Herkese açık kayıt yok; hesapları Admin açar. Parola ve sır hiçbir ekranda gösterilmez." />
          {users.error ? (
            <div className="p-4">
              <ErrorState message={users.error} onRetry={() => void users.refetch()} />
            </div>
          ) : users.loading ? (
            <div className="p-4">
              <SkeletonLines lines={5} />
            </div>
          ) : (
            <ul className="divide-y divide-hairline">
              {(users.data ?? []).map((u) => {
                const role = u.roles[0];
                const self = u.id === me.uid;
                return (
                  <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center border-[1.5px] border-ink text-[14px] font-medium", self ? "bg-ink text-on-dark" : "bg-paper")}>
                      {role ? ROLE_CODE[role] : "?"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-dense font-medium text-ink">
                        {u.display_name}
                        {self ? <Badge tone="wash">siz</Badge> : null}
                      </span>
                      <span className="block truncate text-meta text-muted">
                        {u.email} · son giriş {u.last_login_at ? fmtDateTime(u.last_login_at) : "—"}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {u.roles.map((r) => (
                        <Badge key={r} tone="outline">
                          {ROLE_LABEL[r]}
                        </Badge>
                      ))}
                      <Badge tone={u.totp_enabled ? "ink" : "muted"}>{u.totp_enabled ? "TOTP açık" : "TOTP yok"}</Badge>
                    </span>
                    {self ? <span className="basis-full pl-12 text-meta text-muted">Kendi rolünüzü değiştiremezsiniz.</span> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel aria-labelledby="sod-title">
          <PanelHeader id="sod-title" title="Görevler ayrılığı" meta="Sunucu (ve mock API) her istekte yeniden denetler; düğmeyi gizlemek koruma değildir." />
          <ol className="divide-y divide-hairline">
            {SOD_RULES.map((r) => (
              <li key={r.code} className="flex gap-3 px-4 py-2.5 text-dense">
                <span className="code w-4 text-muted">{r.code}</span>
                <span className="text-ink">{r.text}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <Panel aria-labelledby="matrix-title">
        <PanelHeader id="matrix-title" title="Yetki matrisi" meta="Koddaki ROLE_PERMS'ten üretilir (09 §5). ↑ = son 5 dk TOTP adım-yukarı." />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-dense">
            <caption className="sr-only">Rol başına izinler</caption>
            <thead>
              <tr className="border-b-[1.5px] border-ink bg-sunk text-meta text-ink-soft">
                <th scope="col" className="h-9 px-3 text-left font-medium">
                  İzin
                </th>
                {Role.options.map((r) => (
                  <th key={r} scope="col" className="h-9 w-10 text-center font-medium" title={ROLE_LABEL[r]}>
                    <abbr title={ROLE_LABEL[r]} className="no-underline">
                      {ROLE_CODE[r]}
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.perm} className="border-b border-hairline">
                  <th scope="row" className="px-3 py-1.5 text-left font-normal text-ink">
                    {row.label}
                    {row.stepUp ? (
                      <span className="ml-1 text-muted" title="TOTP adım-yukarı">
                        ↑
                      </span>
                    ) : null}
                  </th>
                  {Role.options.map((r) => (
                    <td key={r} className="text-center">
                      {row.roles[r] ? (
                        <span aria-label={`${ROLE_LABEL[r]}: var`} className="inline-grid size-[18px] place-items-center border border-ink bg-ink text-[12px] text-on-dark">
                          ✓
                        </span>
                      ) : (
                        <span aria-label={`${ROLE_LABEL[r]}: yok`} className="text-rule-soft">
                          ·
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
