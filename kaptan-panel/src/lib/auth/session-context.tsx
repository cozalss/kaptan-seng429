"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Role } from "@/lib/domain/user";

/** The signed-in user as the server saw it (mock cookie or http /me). */
export interface SessionUser {
  uid: string;
  email: string;
  name: string;
  role: Role;
}

const SessionContext = createContext<SessionUser | null>(null);

export function SessionProvider({ user, children }: { user: SessionUser; children: ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

/** Current user; throws outside the panel layout (a programming error, not a user state). */
export function useSession(): SessionUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useSession must be used inside <SessionProvider>");
  return user;
}

export function useOptionalSession(): SessionUser | null {
  return useContext(SessionContext);
}
