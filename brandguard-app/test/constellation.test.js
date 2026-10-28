import { describe, it, expect } from "vitest";
import {
  clarityColor,
  clarityBand,
  nodeRadius,
  layoutNodes,
  buildNodes,
} from "../client/src/constellation.js";

// Spec §12: "each rule is a node; size equals violations, colour equals
// clarity score (red means likely ambiguous). Clicking a node opens that
// rule's findings." These tests pin that encoding.

const rules = [
  { ruleId: "R-TONE-1", count: 5, clarity: 90, accepted: 5, edited: 0, disputed: 0 },
  { ruleId: "R-CLAIM-1", count: 2, clarity: 40, accepted: 0, edited: 1, disputed: 3 },
  { ruleId: "F-SALE", count: 8, clarity: null, accepted: 0, edited: 0, disputed: 0 },
];

describe("clarity → colour encoding", () => {
  it("high clarity is green, mid is amber, low is red (ambiguous)", () => {
    expect(clarityColor(90)).toBe("#1F5F4A");
    expect(clarityColor(65)).toBe("#A97C2C");
    expect(clarityColor(20)).toBe("#B3261E");
  });

  it("undecided rules (no clarity) get a neutral tone, not a verdict colour", () => {
    expect(clarityColor(null)).toBe("#8a7867");
    expect(clarityColor(undefined)).toBe("#8a7867");
  });

  it("band labels match the colour thresholds", () => {
    expect(clarityBand(90)).toBe("clear");
    expect(clarityBand(65)).toBe("ok");
    expect(clarityBand(20)).toBe("unclear");
    expect(clarityBand(null)).toBe("no decisions");
  });
});

describe("violation count → node size", () => {
  it("a bigger count is a bigger node", () => {
    expect(nodeRadius(8, 8)).toBeGreaterThan(nodeRadius(2, 8));
  });

  it("size is bounded so one hot rule can't swallow the view", () => {
    expect(nodeRadius(8, 8)).toBeLessThanOrEqual(1.15);
    expect(nodeRadius(0, 8)).toBeGreaterThanOrEqual(0.34);
  });

  it("the max count maps to the max radius", () => {
    expect(nodeRadius(8, 8)).toBeCloseTo(1.15, 2);
  });

  it("degenerate inputs don't produce NaN or throw", () => {
    expect(Number.isFinite(nodeRadius(0, 0))).toBe(true);
    expect(Number.isFinite(nodeRadius(undefined, undefined))).toBe(true);
    expect(Number.isFinite(nodeRadius(-3, 4))).toBe(true);
  });
});

describe("layoutNodes — deterministic placement", () => {
  it("returns one positioned node per rule", () => {
    const out = layoutNodes(rules);
    expect(out).toHaveLength(3);
    for (const n of out) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.z)).toBe(true);
    }
  });

  it("is deterministic — same input gives identical coordinates", () => {
    expect(layoutNodes(rules)).toEqual(layoutNodes(rules));
  });

  it("places distinct rules at distinct positions", () => {
    const out = layoutNodes(rules);
    const keys = new Set(out.map((n) => `${n.x},${n.z}`));
    expect(keys.size).toBe(out.length);
  });

  it("handles the empty case", () => {
    expect(layoutNodes([])).toEqual([]);
    expect(layoutNodes(undefined)).toEqual([]);
  });
});

describe("buildNodes — the click→findings payload (spec F17)", () => {
  const { nodes, maxCount } = buildNodes(rules, (id) => `text of ${id}`);

  it("carries the rule id, count and resolved label for each node", () => {
    expect(nodes).toHaveLength(3);
    expect(maxCount).toBe(8);
    const tone = nodes.find((n) => n.ruleId === "R-TONE-1");
    expect(tone.count).toBe(5);
    expect(tone.label).toBe("text of R-TONE-1");
  });

  it("stamps each node with its clarity colour and band so the scene can render it", () => {
    const claim = nodes.find((n) => n.ruleId === "R-CLAIM-1");
    expect(claim.color).toBe("#B3261E");
    expect(claim.band).toBe("unclear");
    const undecided = nodes.find((n) => n.ruleId === "F-SALE");
    expect(undecided.band).toBe("no decisions");
  });

  it("keeps a size (radius) so bigger counts read as bigger nodes", () => {
    const tone = nodes.find((n) => n.ruleId === "R-TONE-1");
    const claim = nodes.find((n) => n.ruleId === "R-CLAIM-1");
    expect(tone.radius).toBeGreaterThan(claim.radius);
  });

  it("degrades to an empty node list when there is nothing to show", () => {
    expect(buildNodes([]).nodes).toEqual([]);
    expect(buildNodes(undefined).nodes).toEqual([]);
  });
});
