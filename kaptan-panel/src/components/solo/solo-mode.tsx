"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Is /benim running for one person (single-user deployment) or as the personal view of a team
 * desk? The layout decides on the server (env flag or GET /health) and passes it down. Rendered
 * on its own (tests, stories) the home behaves as single-user; the API still enforces roles.
 */
const SoloModeContext = createContext<boolean>(true);

export function SoloModeProvider({ singleUser, children }: { singleUser: boolean; children: ReactNode }) {
  return <SoloModeContext.Provider value={singleUser}>{children}</SoloModeContext.Provider>;
}

export function useSingleUser(): boolean {
  return useContext(SoloModeContext);
}
