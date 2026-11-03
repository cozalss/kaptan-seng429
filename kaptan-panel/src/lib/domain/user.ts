import { z } from "zod";
import { IsoDateTime } from "./common";

/** The one person using the app. A `role` the backend may still send is stripped by zod. */
export const Me = z.object({
  id: z.string(),
  display_name: z.string(),
});
export type Me = z.infer<typeof Me>;

/** A recorded step on a change (a limit, a restart): who took it, when and why. */
export const Signature = z.object({
  uid: z.string(),
  name: z.string(),
  at: IsoDateTime,
  reason: z.string().nullable(),
});
export type Signature = z.infer<typeof Signature>;

/** What the sign-in endpoint accepts (mock route; the http API takes the same body). */
export const LoginRequest = z.object({
  passphrase: z.string().max(200),
});
export type LoginRequest = z.infer<typeof LoginRequest>;
