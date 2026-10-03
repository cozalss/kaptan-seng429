"use client";

import Link from "next/link";
import { routeFor, routesFor } from "@/lib/auth/routes";
import { useSession } from "@/lib/auth/session-context";
import { ROLE_CODE, ROLE_LABEL } from "@/lib/domain/user";
import { Kbd } from "@/components/ui/primitives";

/** "Bu ekran {rol} rolüne kapalı" + the screens this role may open (FRONTEND-SPEC §2.13). */
export function RoleRoutes({ from }: { from: string | null }) {
  const user = useSession();
  const route = from ? routeFor(from) : undefined;
  const routes = routesFor(user.role).filter((r) => r.href !== "/styleguide");
  return (
    <>
      <p className="mt-3 text-ui text-ink-soft">
        {route ? (
          <>
            <span className="font-medium text-ink">{route.label}</span> ekranı <span className="font-medium text-ink">{ROLE_LABEL[user.role]}</span> rolüne kapalı.{" "}
          </>
        ) : null}
        Yetki kuralları sunucuda uygulanır; düğmeyi gizlemek tek başına koruma değildir. Erişim gerekiyorsa Admin ile konuşun.
      </p>
      <nav aria-label="Rolünüzün açabildiği ekranlar" className="mt-6 border-t border-hairline pt-4">
        <h2 className="flex items-center gap-2 text-dense font-medium text-ink">
          <span aria-hidden className="grid size-6 place-items-center border-[1.5px] border-ink text-[12px]">
            {ROLE_CODE[user.role]}
          </span>
          {ROLE_LABEL[user.role]} olarak açabildikleriniz
        </h2>
        <ul className="mt-3 grid gap-x-4 sm:grid-cols-2">
          {routes.map((r) => (
            <li key={r.href}>
              <Link href={r.href} className="group flex h-10 items-center gap-3 border-b border-hairline text-ui text-ink-soft hover:text-ink">
                <span className="flex-1">
                  <span className="text-ink group-hover:underline group-hover:underline-offset-4">{r.label}</span>
                  <span className="ml-2 hidden text-meta text-muted md:inline">{r.hint}</span>
                </span>
                <Kbd aria-hidden>g</Kbd>
                <Kbd aria-hidden>{r.goKey}</Kbd>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
