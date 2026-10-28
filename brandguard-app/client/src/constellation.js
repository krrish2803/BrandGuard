/**
 * Rule constellation (F17) — pure layout maths.
 *
 * Spec §12: "each rule is a node; size equals violations, colour equals clarity
 * score (red means likely ambiguous). Clicking a node opens that rule's
 * findings."
 *
 * This module turns the /api/insights payload into node descriptors. It is
 * deliberately pure — numbers and colours in, plain objects out — so it can be
 * unit-tested with Vitest and reused by both the 3D scene and the 2D fallback.
 * No three.js, no WebGL, no DOM.
 */

/** Clarity colour bands — matches ClarityMeter and the severity tokens. */
export function clarityColor(clarity) {
  if (clarity === null || clarity === undefined) return "#8a7867"; // undecided → neutral
  if (clarity >= 80) return "#1F5F4A"; // forest — clear
  if (clarity >= 50) return "#A97C2C"; // caramel — ok
  return "#B3261E"; // sev-high red — likely ambiguous
}

/** Human band label for the legend/tooltip. */
export function clarityBand(clarity) {
  if (clarity === null || clarity === undefined) return "no decisions";
  if (clarity >= 80) return "clear";
  if (clarity >= 50) return "ok";
  return "unclear";
}

/**
 * Node radius from violation count: sqrt scaling so *area* tracks the count
 * (linear radius makes a 4× count look 4× wider, over-dominating the scene).
 * Bounded to a readable range so one hot rule can't swallow the constellation.
 */
export function nodeRadius(count, maxCount, { min = 0.34, max = 1.15 } = {}) {
  const c = Math.max(0, Number(count) || 0);
  const peak = Math.max(1, Number(maxCount) || 1);
  const t = Math.sqrt(c / peak); // 0..1
  return +(min + t * (max - min)).toFixed(3);
}

/**
 * Deterministic node positions on a flat disc (Fibonacci-style ring packing).
 *
 * Seeded by index — not random — so the constellation looks identical on every
 * render and in tests. The biggest rule sits at the centre (most violations =
 * the anchor of the picture); the rest spiral outward by descending count.
 *
 * @param {Array<{ruleId:string,count:number}>} rules
 * @returns {Array<{ruleId:string,x:number,z:number,count:number}>}
 */
export function layoutNodes(rules) {
  const list = Array.isArray(rules) ? [...rules] : [];
  if (list.length === 0) return [];

  // Biggest first → centre; ties broken by ruleId for stable ordering.
  list.sort((a, b) => (b.count - a.count) || String(a.ruleId).localeCompare(String(b.ruleId)));

  const golden = Math.PI * (3 - Math.sqrt(5)); // sunflower angle
  const radiusOf = (i, n) => (n <= 1 ? 0 : 2.6 * Math.sqrt(i / (n - 1))); // spread disc

  return list.map((r, i) => {
    const rad = radiusOf(i, list.length);
    const angle = i * golden;
    return {
      ruleId: r.ruleId,
      count: r.count ?? 0,
      x: +(Math.cos(angle) * rad).toFixed(3),
      z: +(Math.sin(angle) * rad).toFixed(3),
    };
  });
}

/**
 * Build the full node list for the scene. Pure: insights payload + rule lookup
 * in, descriptors out. `clarity` is passed through so colour/label can be read
 * without a second lookup.
 *
 * @param {Array} topViolatedRules rows from GET /api/insights
 * @param {(id:string)=>string} ruleText lookup for the node tooltip
 */
export function buildNodes(topViolatedRules, ruleText = () => "") {
  const rows = Array.isArray(topViolatedRules) ? topViolatedRules : [];
  if (rows.length === 0) return { nodes: [], maxCount: 0 };

  const maxCount = Math.max(1, ...rows.map((r) => r.count ?? 0));
  const positions = new Map(layoutNodes(rows).map((p) => [p.ruleId, p]));

  const nodes = rows.map((r) => {
    const p = positions.get(r.ruleId) ?? { x: 0, z: 0 };
    const clarity = r.clarity ?? null;
    return {
      ruleId: r.ruleId,
      label: ruleText(r.ruleId) || r.ruleId,
      count: r.count ?? 0,
      clarity,
      band: clarityBand(clarity),
      color: clarityColor(clarity),
      radius: nodeRadius(r.count, maxCount),
      x: p.x,
      z: p.z,
      // carried so a click can open the rule's own findings/highlights
      accepted: r.accepted ?? 0,
      edited: r.edited ?? 0,
      disputed: r.disputed ?? 0,
    };
  });

  return { nodes, maxCount };
}
