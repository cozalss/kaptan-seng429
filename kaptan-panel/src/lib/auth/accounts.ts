import type { Role } from "@/lib/domain/user";

/**
 * Seeded mock accounts (09 §5 suggests: Rol 3 = Risk Officer, Rol 4 = Admin,
 * Rol 1–2 = Analist, and an Auditor account named "Hoca" for the jury).
 * The password is public on purpose and shown on /login in mock mode only.
 */
export const DEMO_PASSWORD = "kaptan-demo";

export interface DemoAccount {
  uid: string;
  email: string;
  name: string;
  role: Role;
  blurb: string;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { uid: "u-risk", email: "risk@kaptan.demo", name: "Zeynep (Risk Officer)", role: "risk_officer", blurb: "Onaylar, kill switch, limitler" },
  { uid: "u-admin", email: "admin@kaptan.demo", name: "Burak (Admin)", role: "admin", blurb: "Kullanıcılar, evren, demo, reset başlatma" },
  { uid: "u-analist", email: "analist@kaptan.demo", name: "Mert (Analist)", role: "analyst", blurb: "Akışı izler, not ekler" },
  { uid: "u-denetci", email: "denetci@kaptan.demo", name: "Hoca (Auditor)", role: "auditor", blurb: "Her şeyi görür, hiçbir şey yazamaz" },
];

/** A second Risk Officer so four-eyes flows can be tried in mock mode. */
export const EXTRA_ACCOUNTS: readonly DemoAccount[] = [
  { uid: "u-risk2", email: "risk2@kaptan.demo", name: "Elif (Risk Officer)", role: "risk_officer", blurb: "İkinci onaylayıcı" },
];

const ALL_ACCOUNTS: readonly DemoAccount[] = [...DEMO_ACCOUNTS, ...EXTRA_ACCOUNTS];

export function findAccountByEmail(email: string): DemoAccount | undefined {
  const needle = email.trim().toLocaleLowerCase("tr-TR");
  return ALL_ACCOUNTS.find((a) => a.email === needle);
}

export function findAccountByUid(uid: string): DemoAccount | undefined {
  return ALL_ACCOUNTS.find((a) => a.uid === uid);
}

/** The account a role switch lands on (first seeded account with that role). */
export function accountForRole(role: Role): DemoAccount {
  const found = ALL_ACCOUNTS.find((a) => a.role === role);
  if (!found) throw new Error(`Seed account missing for role ${role}`);
  return found;
}

export function authenticateDemo(email: string, password: string): DemoAccount | null {
  const account = findAccountByEmail(email);
  if (!account || password !== DEMO_PASSWORD) return null;
  return account;
}

/** Display name for a uid ("u-risk") or an audit actor ("user:u-risk"); unknown ids pass through. */
export function accountName(uid: string): string {
  const id = uid.startsWith("user:") ? uid.slice(5) : uid;
  return findAccountByUid(id)?.name ?? uid;
}
