import { z } from "zod";

/**
 * Personal mode (PERSONAL-SPEC.md §1): the panel has exactly one user, "Sen". There are no
 * roles, no permissions and no second approver; every decision in the audit chain is
 * `user:sen`.
 */
export const OWNER = Object.freeze({ uid: "sen", name: "Sen" });

export const Me = z.object({
  id: z.string(),
  display_name: z.string(),
});
export type Me = z.infer<typeof Me>;

/** /login takes one passphrase (mock: the demo passphrase is printed on the page). */
export const LoginInput = z.object({
  passphrase: z.string().min(1, "Parola gerekli").max(200, "Parola çok uzun"),
});
export type LoginInput = z.infer<typeof LoginInput>;
