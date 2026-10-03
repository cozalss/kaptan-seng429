import { z } from "zod";

/** Canonical roles (09 §5). Short codes as in 04 §11: A R D U. */
export const Role = z.enum(["analyst", "risk_officer", "admin", "auditor"]);
export type Role = z.infer<typeof Role>;

export const ROLE_CODE: Readonly<Record<Role, "A" | "R" | "D" | "U">> = {
  analyst: "A",
  risk_officer: "R",
  admin: "D",
  auditor: "U",
};

export const ROLE_LABEL: Readonly<Record<Role, string>> = {
  analyst: "Analist",
  risk_officer: "Risk Officer",
  admin: "Admin",
  auditor: "Auditor",
};

export const Me = z.object({
  id: z.string(),
  email: z.email(),
  display_name: z.string(),
  roles: z.array(Role).min(1),
  /** TOTP verified within the last 5 minutes (step-up, 09 §6). */
  mfa_fresh: z.boolean(),
});
export type Me = z.infer<typeof Me>;

export const LoginInput = z.object({
  email: z.email("Geçerli bir e-posta girin"),
  password: z.string().min(1, "Parola gerekli"),
});
export type LoginInput = z.infer<typeof LoginInput>;
