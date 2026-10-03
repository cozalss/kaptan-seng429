import { z } from "zod";
import { IsoDateTime } from "@/lib/domain/common";
import { Role } from "@/lib/domain/user";

/** GET /admin/users row (09 §5: roles, TOTP, last login; no passwords ever). */
export const AdminUserView = z.object({
  id: z.string(),
  email: z.email(),
  display_name: z.string(),
  roles: z.array(Role),
  totp_enabled: z.boolean(),
  last_login_at: IsoDateTime.nullable(),
  active: z.boolean(),
});
export type AdminUserView = z.infer<typeof AdminUserView>;
