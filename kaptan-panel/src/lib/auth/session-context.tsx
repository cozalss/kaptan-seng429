"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Role } from "@/lib/domain/user";

/** The signed-in person and the role they look through (mock cookie or http /me). */
export interface SessionUser {
  uid: string;
  name: string;
  role: Role;
}

interface SessionValue {
  user: SessionUser;
  /** Replace the user after a role change (the server already stored it). */
  setUser: (u: SessionUser) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Holds the user in client state so a role change is instant; a new `user` prop (a fresh
 * server render after login or reload) replaces it.
 */
export function SessionProvider({ user, children }: { user: SessionUser; children: ReactNode }) {
  const [current, setCurrent] = useState(user);
  const [fromProps, setFromProps] = useState(user);
  if (fromProps.uid !== user.uid || fromProps.role !== user.role || fromProps.name !== user.name) {
    setFromProps(user);
    setCurrent(user);
  }
  const setUser = useCallback((u: SessionUser) => setCurrent(u), []);
  const value = useMemo(() => ({ user: current, setUser }), [current, setUser]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Current user; throws outside the panel layout (a programming error, not a user state). */
export function useSession(): SessionUser {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession must be used inside <SessionProvider>");
  return v.user;
}

export function useOptionalSession(): SessionUser | null {
  return useContext(SessionContext)?.user ?? null;
}

export function useSetSessionUser(): (u: SessionUser) => void {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSetSessionUser must be used inside <SessionProvider>");
  return v.setUser;
}
