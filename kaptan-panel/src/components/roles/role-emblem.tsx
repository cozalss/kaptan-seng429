import type { CSSProperties } from "react";
import type { Role } from "@/lib/domain/user";
import { cn } from "@/lib/utils";

/**
 * One drawn emblem per role, in the landing's hand: flat ink lines (non-scaling, so a 16 px
 * chip and a 200 px door keep the same 1.5 px line), one tint fill, no gradients.
 *   Analist — an open log with a loupe (reads closely).
 *   Risk Sorumlusu — a pen nib finishing a signature (signs last).
 *   Yönetici — the ship's wheel (sets the course of the desk).
 *   Denetçi — a lighthouse (sees everything, touches nothing).
 * Colour comes from `currentColor`; the fill from `--tone-tint` when a tone class is set.
 * Decorative: the role's name is always written next to it.
 */
const LINE = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, vectorEffect: "non-scaling-stroke", strokeLinejoin: "round", strokeLinecap: "round" } as const;
const TINT = "var(--tone-tint, transparent)";

function Analyst() {
  return (
    <>
      <path d="M6 46 C14 41.5 23 41.5 32 46 C41 41.5 50 41.5 58 46 V19 C50 14.5 41 14.5 32 19 C23 14.5 14 14.5 6 19 Z" fill={TINT} />
      <path d="M6 46 C14 41.5 23 41.5 32 46 C41 41.5 50 41.5 58 46 V19 C50 14.5 41 14.5 32 19 C23 14.5 14 14.5 6 19 Z M32 19 V46" {...LINE} />
      <path d="M11 25 H27 M11 30 H27 M11 35 H22" {...LINE} />
      <circle cx="43" cy="30" r="8" fill="var(--panel)" />
      <circle cx="43" cy="30" r="8" {...LINE} />
      <path d="M39 30 H47 M40.5 33.5 H45" {...LINE} />
      <path d="M49 36 L56 43" {...LINE} strokeWidth={3} />
    </>
  );
}

function Risk() {
  return (
    <>
      <path d="M22 41 L26 28 L45 9 L55 19 L36 38 Z" fill={TINT} />
      <path d="M22 41 L26 28 L45 9 L55 19 L36 38 Z M22 41 L36.5 26.5 M41 13 L51 23" {...LINE} />
      <circle cx="38.5" cy="24.5" r="2.2" {...LINE} />
      <path d="M5 53 C9 47 12 57 16 51 S22 45 25 51 S31 57 36 50 C39 47 42 53 46 51" {...LINE} />
      <path d="M5 59 H59" {...LINE} strokeDasharray="1 3" />
    </>
  );
}

const SPOKES = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
const at = (a: number, r: number) => `${(32 + r * Math.cos(a)).toFixed(2)} ${(32 + r * Math.sin(a)).toFixed(2)}`;

function Admin() {
  return (
    <>
      <circle cx="32" cy="32" r="17" fill={TINT} />
      <circle cx="32" cy="32" r="17" {...LINE} />
      <circle cx="32" cy="32" r="13.5" {...LINE} />
      <circle cx="32" cy="32" r="4.5" fill="var(--panel)" />
      <circle cx="32" cy="32" r="4.5" {...LINE} />
      <path d={SPOKES.map((a) => `M${at(a, 4.5)} L${at(a, 25)}`).join(" ")} {...LINE} />
      {SPOKES.map((a) => {
        const [x, y] = at(a, 26.5).split(" ").map(Number);
        return <circle key={a} cx={x} cy={y} r="2.4" {...LINE} fill="var(--panel)" />;
      })}
    </>
  );
}

function Auditor() {
  return (
    <>
      <path d="M37 18 L60 11 V29 L37 22 Z M27 18 L4 11 V29 L27 22 Z" fill={TINT} />
      <path d="M37 18 L60 11 M37 22 L60 29 M27 18 L4 11 M27 22 L4 29" {...LINE} />
      <path d="M26.5 55 L28.5 25 H35.5 L37.5 55 Z" fill="var(--panel)" />
      <path d="M26.5 55 L28.5 25 H35.5 L37.5 55 Z M27.6 45 H36.4 M28.2 35 H35.8" {...LINE} />
      <rect x="27" y="15" width="10" height="10" fill="var(--panel)" />
      <rect x="27" y="15" width="10" height="10" {...LINE} />
      <circle cx="32" cy="20" r="2.2" fill="currentColor" />
      <path d="M25 15 L32 8.5 L39 15 Z" {...LINE} />
      <path d="M8 55 H56 M14 60 C20 57 24 61 30 58.5 S40 57 46 59.5" {...LINE} />
    </>
  );
}

const DRAWING: Readonly<Record<Role, () => React.JSX.Element>> = { analyst: Analyst, risk_officer: Risk, admin: Admin, auditor: Auditor };

export function RoleEmblem({ role, className, style }: { role: Role; className?: string; style?: CSSProperties }) {
  const Drawing = DRAWING[role];
  return (
    <svg aria-hidden viewBox="0 0 64 64" data-emblem={role} className={cn("overflow-visible", className)} style={style}>
      <Drawing />
    </svg>
  );
}
