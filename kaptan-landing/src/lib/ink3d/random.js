// Seeded randomness for the ink scenes: every hand-drawn wobble and every scene's cast is a pure
// function of its seed, so the same frame always draws the same picture.

/** mulberry32: small, fast, seedable; returns floats in [0, 1). */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
