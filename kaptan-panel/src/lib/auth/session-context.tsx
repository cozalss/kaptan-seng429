"use client";

import { createContext, useContext, type ReactNode } from "react";

/** The signed-in person (GET /me, or the test double's cookie). */
export interface SessionUser {
  uid: string;
  name: string;
}

/** What the API calls a person who never gave a name: not a name to greet anyone with. */
const PLACEHOLDER_NAMES: ReadonlySet<string> = new Set(["sahip", "owner"]);

/** The person's real name, or null when there is none ("İyi günler." then, with no name). */
export function realName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed && !PLACEHOLDER_NAMES.has(trimmed.toLocaleLowerCase("tr-TR")) ? trimmed : null;
}

const SessionContext = createContext<SessionUser | null>(null);

export function SessionProvider({ user, children }: { user: SessionUser; children: ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

/** Current user; throws outside the app layout (a programming error, not a user state). */
export function useSession(): SessionUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useSession must be used inside <SessionProvider>");
  return user;
}
