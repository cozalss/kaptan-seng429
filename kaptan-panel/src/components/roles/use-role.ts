"use client";

import { useCallback, useState } from "react";
import { can, type Action } from "@/lib/auth/permissions";
import { useSession, useSetSessionUser } from "@/lib/auth/session-context";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { ROLE_LABEL, type Role } from "@/lib/domain/role-meta";
import { notify } from "@/components/ui/toast";

/** An account switch is confirmed in place (the account menu changes); its slip only needs a glance. */
const SWITCH_TOAST_MS = 2_500;

/** The role you look through, what it may do, and a way to switch (kept in the session). */
export function useRole() {
  const user = useSession();
  const setUser = useSetSessionUser();
  const api = useApi();
  const [switching, setSwitching] = useState(false);

  const switchTo = useCallback(
    async (role: Role, opts: { quiet?: boolean } = {}): Promise<boolean> => {
      if (role === user.role) return true;
      setSwitching(true);
      try {
        const me = await api.setRole(role);
        setUser({ uid: me.id, name: me.display_name, role: me.role });
        if (!opts.quiet) notify.info(`Hesap değişti: ${me.display_name}, ${ROLE_LABEL[me.role]}.`, undefined, { duration: SWITCH_TOAST_MS });
        return true;
      } catch (e) {
        notify.error("Rol değiştirilemedi", errorMessage(e));
        return false;
      } finally {
        setSwitching(false);
      }
    },
    [api, setUser, user.role],
  );

  return {
    role: user.role,
    user,
    can: (action: Action) => can(user.role, action),
    switchTo,
    switching,
  };
}
