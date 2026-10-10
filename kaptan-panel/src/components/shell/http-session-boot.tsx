"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createHttpApi } from "@/lib/api/http/http-api";
import type { SessionUser } from "@/lib/auth/session-context";
import { SkeletonLines } from "@/components/ui/primitives";
import { AppShell } from "./app-shell";

/**
 * http mode only: resolve the user with GET /me (refreshing the JWT from the
 * __Host-kaptan_rt cookie if needed), then render the shell. On failure → /login.
 */
export function HttpSessionBoot({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let alive = true;
    createHttpApi()
      .me()
      .then((me) => {
        if (alive) setUser({ uid: me.id, name: me.display_name, role: me.role });
      })
      .catch(() => router.replace("/login"));
    return () => {
      alive = false;
    };
  }, [router]);

  if (!user) {
    return (
      <div className="mx-auto max-w-md p-10">
        <SkeletonLines lines={4} />
      </div>
    );
  }
  return <AppShell user={user}>{children}</AppShell>;
}
