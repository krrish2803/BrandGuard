/**
 * Deterministic pseudo-random number generator (mulberry32).
 *
 * Used in the 3D scene components to generate particle/node positions
 * deterministically instead of calling `Math.random()` during render,
 * which React's purity rule (and eslint-plugin-react-hooks) flags.
 * A seeded PRNG keeps geometry stable across re-renders and is fully pure.
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
