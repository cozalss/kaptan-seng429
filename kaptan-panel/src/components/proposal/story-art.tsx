/**
 * Small ink drawings for the "Neden?" chapters, in the landing's hand: sumi strokes, engraved
 * hatching, one red accent. Decorative; every one of them repeats what the words next to it say.
 */
const INK = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** A disclosure: a printed sheet with its ruled lines and the red flag of something new. */
export function ArtSheet({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 96 96" className={className}>
      <g {...INK} strokeWidth="2.4">
        <path d="M23 9.5 73.5 8l1.2 79-52 1.4Z" />
        <path d="M31.5 27h27M31.5 36h34M31.5 45h31M31.5 54h34M31.5 63h20" strokeWidth="1.8" />
        <path d="m57.5 70 9 7m0-7-3 2.5" strokeWidth="0" />
      </g>
      <path d="M62 9v22" stroke="currentColor" strokeWidth="1.8" />
      <path d="M62 9.5 76 15l-14 5.5Z" fill="var(--north)" />
      <path d="M34 72h26M34 76.5h18" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2.5" />
    </svg>
  );
}

/** Looking back: a telescope turned towards the wake behind the boat. */
export function ArtWake({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 96 96" className={className}>
      <g {...INK} strokeWidth="2.2">
        <path d="M4 66c8-3.5 14-3.5 22 0s14 3.5 22 0 14-3.5 22 0 14 3.5 22 0" />
        <path d="M10 77c7-3 12-3 19 0s12 3 19 0 12-3 19 0" strokeWidth="1.6" />
        <path d="M22 86c5-2 9-2 14 0s9 2 14 0" strokeWidth="1.2" />
      </g>
      <path d="M56 12v42" stroke="currentColor" strokeWidth="1.8" />
      <path d="M56 12 68 17 56 22Z" fill="var(--north)" />
      <path d="M59 25c7 5 11 13 12 25H59Z" fill="currentColor" />
      <path d="M53 29c-5 5-8 12-9 21h9Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M38 54h38l-5 7.5a2 2 0 0 1-1.7.9H45a2 2 0 0 1-1.7-.9Z" fill="currentColor" />
    </svg>
  );
}

/** What could go wrong: the storm, and the boat leaning into it. */
export function ArtStorm({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 96 96" className={className}>
      <g {...INK} strokeWidth="2.4">
        <path d="M22 37c-9 0-13-11-5-16 1-9 13-12 19-6 5-8 21-7 24 3 9-2 16 7 11 14-2 4-6 5-10 5Z" />
        <path d="M19 45 13 57M31 45l-6 12M73 45l-5 11" strokeWidth="1.8" />
        <path d="M4 79c6-5 11-5 17-1s12 4 18 0 12-4 18 0 12 4 18 0 11-4 17 1" />
        <path d="M10 88c6-3 10-3 16 0s10 3 16 0 10-3 16 0 10 3 16 0" strokeWidth="1.4" />
      </g>
      <path d="m46 41-7 13h7l-5 12 13-16h-7l5-9Z" fill="var(--north)" />
      <g transform="rotate(14 70 70)">
        <path d="M70 46v24" stroke="currentColor" strokeWidth="1.6" />
        <path d="M72 50c5 4 8 10 9 18h-9Z" fill="currentColor" />
        <path d="M58 70h24l-3.5 5.4a2 2 0 0 1-1.6.8H63a2 2 0 0 1-1.6-.8Z" fill="currentColor" />
      </g>
    </svg>
  );
}

/** How much of your money: a stack of coins with one set apart. */
export function ArtCoins({ className }: { className?: string }) {
  const coin = (x: number, y: number, key: string) => (
    <g key={key} transform={`translate(${x} ${y})`}>
      <path d="M0 0c0-3 7.5-5.5 16-5.5S32-3 32 0v7c0 3-7.5 5.5-16 5.5S0 10 0 7Z" fill="var(--panel)" stroke="currentColor" strokeWidth="2" />
      <path d="M0 0c0 3 7.5 5.5 16 5.5S32 3 32 0" fill="none" stroke="currentColor" strokeWidth="2" />
    </g>
  );
  return (
    <svg aria-hidden viewBox="0 0 96 96" className={className}>
      {[72, 62, 52, 42, 32, 22].map((y) => coin(8, y, `a${y}`))}
      {coin(56, 74, "b")}
      <path d="M50 72c1-5 4-9 8-11" fill="none" stroke="var(--north)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="m53 60 5.5 1-1.6 5.3" fill="none" stroke="var(--north)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
