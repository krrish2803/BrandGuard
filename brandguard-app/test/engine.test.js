import { describe, it, expect } from "vitest";
import {
  review,
  validateCitations,
  factscan,
  reverseAlerts,
  diffWords,
  rules as seedRules,
  facts as seedFacts,
} from "../src/index.js";
import { examples, seedItems } from "../src/seed.js";

const ASOF = "2026-10-27";
const ex = (id) => examples.find((e) => e.id === id);
const kb = { rules: seedRules, facts: seedFacts };

describe("Example 1 — Instagram caption (many violations)", () => {
  const result = review(ex("example-1").text, { asOf: ASOF });

  it("produces multiple findings covering the expected rules", () => {
    expect(result.findings.length).toBeGreaterThanOrEqual(9);
    const ruleIds = new Set(result.findings.map((f) => f.ruleId));
    for (const id of [
      "R-TONE-1", // ALL CAPS + exclamation run
      "R-TONE-2", // OMG slang
      "R-TERM-1", // customers → guests
      "R-TERM-2", // Brew Loom → Brewloom
      "R-TERM-3", // Cheap → affordable
      "R-CLAIM-1", // unsupported BEST
      "R-A11Y-2", // Click here
      "R-FACT-1", // fact findings
    ]) {
      expect(ruleIds, `missing ${id}`).toContain(id);
    }
  });

  it("flags the expired sale fact F-SALE and mismatched delivery fact F-DEL", () => {
    const factIds = result.findings.filter((f) => f.factId).map((f) => f.factId);
    expect(factIds).toContain("F-SALE");
    expect(factIds).toContain("F-DEL");
    const sale = result.findings.find((f) => f.factId === "F-SALE");
    expect(sale.status ?? sale.issue).toMatch(/expired/i);
  });

  it("routes to Reviewer and is not manager-approvable", () => {
    expect(result.route).toBe("Reviewer");
    expect(result.approvable).toBe(false);
    expect(result.counts.high).toBeGreaterThanOrEqual(3);
  });

  it("every finding is citation-verified with a real source quote (F5/F6)", () => {
    for (const f of result.findings) {
      expect(f.citationVerified).toBe(true);
      expect(f.sourceQuote).toBeTruthy();
      expect(ex("example-1").text).toContain(f.spanText);
    }
  });
});

describe("Example 2 — Welcome email (clean)", () => {
  const result = review(ex("example-2").text, { asOf: ASOF });

  it("produces no findings", () => {
    expect(result.findings).toHaveLength(0);
    expect(result.clean).toBe(true);
  });

  it("routes to Manager and is approvable", () => {
    expect(result.route).toBe("Manager");
    expect(result.approvable).toBe(true);
  });
});

describe("Example 3 — Wellness post (reviewer case)", () => {
  const result = review(ex("example-3").text, { asOf: ASOF });

  it("flags health claim, competitor, and guaranteed — nothing else", () => {
    const ruleIds = [...new Set(result.findings.map((f) => f.ruleId))].sort();
    expect(ruleIds).toEqual(["R-CLAIM-1", "R-CLAIM-2", "R-MSG-1"]);
    for (const f of result.findings) expect(f.severity).toBe("high");
  });

  it("Manager cannot approve; routes to Reviewer", () => {
    expect(result.route).toBe("Reviewer");
    expect(result.approvable).toBe(false);
  });
});

describe("F5 — Citation validator", () => {
  const text = ex("example-2").text;

  it("downgrades a finding citing an unknown ruleId to needs-human", () => {
    const [v] = validateCitations(
      [{ ruleId: "R-FAKE-99", severity: "high", spanText: "20% off", issue: "invented rule" }],
      text,
      kb
    );
    expect(v.citationVerified).toBe(false);
    expect(v.needsHuman).toBe(true);
    expect(v.severity).toBe("needs-human");
    expect(v.routedToReviewer).toBe(true);
    expect(v.citationRejectReason).toMatch(/R-FAKE-99/);
  });

  it("downgrades a finding whose span is not a verbatim substring", () => {
    const [v] = validateCitations(
      [{ ruleId: "R-TONE-2", severity: "low", spanText: "totally not in the text" }],
      text,
      kb
    );
    expect(v.citationVerified).toBe(false);
    expect(v.needsHuman).toBe(true);
    expect(v.citationRejectReason).toMatch(/span/i);
  });

  it("passes a valid finding through with a real source quote", () => {
    const [v] = validateCitations(
      [{ ruleId: "R-TERM-3", severity: "low", spanText: "cheap" }],
      "our cheap beans",
      kb
    );
    expect(v.citationVerified).toBe(true);
    expect(v.sourceQuote).toMatch(/Guideline R-TERM-3/);
  });

  it("accepts a fact cited by factId", () => {
    const [v] = validateCitations(
      [{ ruleId: "R-FACT-1", factId: "F-SALE", severity: "high", spanText: "30% off" }],
      "Monsoon sale 30% off",
      kb
    );
    expect(v.citationVerified).toBe(true);
    expect(v.sourceQuote).toMatch(/F-SALE/);
  });

  it("review() surfaces fabricated AI findings as needs-human → Reviewer", () => {
    const r = review(text, {
      asOf: ASOF,
      aiFindings: [
        { ruleId: "R-NOT-REAL", severity: "high", spanText: "Brewloom", issue: "made up" },
      ],
    });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].needsHuman).toBe(true);
    expect(r.route).toBe("Reviewer");
  });
});

describe("F12 — Fact expiry & reverse alerts", () => {
  it("baseline: seeded items are clean against current facts", () => {
    const alerts = factscan(seedItems, seedFacts, ASOF);
    expect(alerts).toHaveLength(0);
  });

  it("changing the offer 20% → 25% flags the seeded welcome email", () => {
    const after = seedFacts.map((f) =>
      f.id === "F-OFFER" ? { ...f, approved: 25 } : f
    );
    const { changed, alerts } = reverseAlerts(seedItems, seedFacts, after, ASOF);

    expect(changed).toEqual([{ factId: "F-OFFER", field: "value", from: 20, to: 25 }]);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const welcome = alerts.find((a) => a.itemId === "item-welcome-email");
    expect(welcome).toBeTruthy();
    expect(welcome.factId).toBe("F-OFFER");
    expect(welcome.owner).toBe("Marketing");
    expect(welcome.spanText).toContain("20%");
    expect(welcome.status).toBe("mismatch");
  });

  it("an expired fact flags any item still claiming it", () => {
    const items = [
      {
        id: "item-monsoon",
        title: "Monsoon repost",
        text: "Monsoon Sale is back! Get 30% off sitewide.",
        status: "approved",
      },
    ];
    const alerts = factscan(items, seedFacts, ASOF); // ASOF is after 30 Sep 2026
    expect(alerts).toHaveLength(1);
    expect(alerts[0].factId).toBe("F-SALE");
    expect(alerts[0].status).toBe("expired");
    expect(alerts[0].owner).toBe("Marketing");
  });

  it("alerts are grouped by owner for notification", () => {
    const after = seedFacts.map((f) => (f.id === "F-OFFER" ? { ...f, approved: 25 } : f));
    const { alerts } = reverseAlerts(seedItems, seedFacts, after, ASOF);
    const grouped = alerts.reduce((m, a) => m.set(a.owner, (m.get(a.owner) ?? 0) + 1), new Map());
    expect(grouped.get("Marketing")).toBeGreaterThanOrEqual(1);
  });
});

describe("Visual checks (F16) — pure module", () => {
  const palette = [
    { name: "espresso", hex: "#3B2A20" },
    { name: "caramel", hex: "#C8963E" },
    { name: "cream", hex: "#F6EFE6" },
    { name: "leaf", hex: "#1F5F4A" },
  ];

  it("no alt text → R-A11Y-1 medium finding", () => {
    const r = review("Cold brew.", { asOf: ASOF, visual: { dominantColors: [] } });
    const f = r.findings.find((x) => x.ruleId === "R-A11Y-1" && x.sourceType === "visual");
    expect(f).toBeTruthy();
    expect(f.severity).toBe("medium");
    expect(f.issue).toMatch(/no alt text/i);
  });

  it("alt text with 'image of' prefix → R-A11Y-1 finding", () => {
    const r = review("Cold brew.", { asOf: ASOF, visual: { altText: "image of a coffee cup" } });
    const f = r.findings.find((x) => x.ruleId === "R-A11Y-1" && x.sourceType === "visual");
    expect(f).toBeTruthy();
    expect(f.visual.problem).toBe("prefix");
  });

  it("good alt text → no alt-text finding", () => {
    const r = review("Cold brew.", { asOf: ASOF, visual: { altText: "Latte art rosetta on a cream cup" } });
    expect(r.findings.some((x) => x.ruleId === "R-A11Y-1" && x.sourceType === "visual")).toBe(false);
  });

  it("alt text outside 5-125 chars → finding", () => {
    const r = review("x", { asOf: ASOF, visual: { altText: "hi" } });
    const f = r.findings.find((x) => x.ruleId === "R-A11Y-1" && x.sourceType === "visual");
    expect(f.visual.problem).toBe("short");
  });

  it("off-palette dominant colour → R-VIS-1 low, with nearest approved colour", () => {
    const r = review("x", { asOf: ASOF, visual: { altText: "Poster", dominantColors: [{ hex: "#FF1493", share: 0.9 }] }, palette });
    const f = r.findings.find((x) => x.ruleId === "R-VIS-1");
    expect(f).toBeTruthy();
    expect(f.severity).toBe("low");
    expect(f.visual.offPalette[0].nearest).toBe("caramel");
    expect(f.confidence).toBeLessThan(0.9); // heuristic ⇒ honest confidence
  });

  it("on-palette colour → no palette finding", () => {
    const r = review("x", { asOf: ASOF, visual: { altText: "Poster", dominantColors: [{ hex: "#C8963E", share: 0.9 }] }, palette });
    expect(r.findings.some((x) => x.ruleId === "R-VIS-1")).toBe(false);
  });

  it("neutral colours (near-black/white/grey) are never flagged as off-palette", () => {
    const r = review("x", {
      asOf: ASOF,
      visual: { altText: "Poster", dominantColors: [{ hex: "#111111", share: 0.5 }, { hex: "#EEEEEE", share: 0.5 }, { hex: "#7F7F7F", share: 0.4 }] },
      palette,
    });
    expect(r.findings.some((x) => x.ruleId === "R-VIS-1")).toBe(false);
  });

  it("low contrast pair → R-A11Y-3 with the measured ratio", () => {
    const r = review("x", { asOf: ASOF, visual: { altText: "Poster", textColor: "#F6EFE6", bgColor: "#C8963E" } });
    const f = r.findings.find((x) => x.ruleId === "R-A11Y-3");
    expect(f).toBeTruthy();
    expect(f.visual.ratio).toBeLessThan(4.5);
    expect(f.issue).toMatch(/contrast/i);
  });

  it("good contrast pair → no contrast finding", () => {
    // espresso on cream is ~11:1
    const r = review("x", { asOf: ASOF, visual: { altText: "Poster", textColor: "#3B2A20", bgColor: "#F6EFE6" } });
    expect(r.findings.some((x) => x.ruleId === "R-A11Y-3")).toBe(false);
  });

  it("visual findings carry a citation and measured evidence, and are not needs-human", () => {
    const r = review("x", { asOf: ASOF, visual: { dominantColors: [{ hex: "#FF1493", share: 0.9 }] }, palette });
    const f = r.findings.find((x) => x.ruleId === "R-VIS-1");
    expect(f.citationVerified).toBe(true);
    expect(f.sourceKind).toBe("visual-measurement");
    expect(f.needsHuman).toBe(false);
    expect(f.sourceQuote).toBeTruthy(); // cites the real rule text
    expect(f.id).toMatch(/^vis-/); // stable id for decisions/receipts
  });

  it("visual findings merge alongside text findings without disturbing them", () => {
    const r = review(ex("example-1").text, { asOf: ASOF, visual: { dominantColors: [{ hex: "#FF1493", share: 0.9 }] }, palette });
    expect(r.findings.some((x) => x.sourceType === "rule")).toBe(true);
    expect(r.findings.some((x) => x.sourceType === "visual")).toBe(true);
    expect(r.counts.total).toBe(r.findings.length);
  });

  it("colour maths: identical colours → 1:1 (fires), black/white → 21:1 (passes)", () => {
    // White-on-white is 1:1 — genuinely unreadable, so it SHOULD fire.
    const same = review("x", { asOf: ASOF, visual: { altText: "P", textColor: "#FFFFFF", bgColor: "#FFFFFF" } });
    const f = same.findings.find((x) => x.ruleId === "R-A11Y-3");
    expect(f).toBeTruthy();
    expect(f.visual.ratio).toBe(1);
    // Black-on-white is ~21:1 — the maximum, well above the 4.5:1 bar.
    const extremes = review("x", { asOf: ASOF, visual: { altText: "P", textColor: "#000000", bgColor: "#FFFFFF" } });
    expect(extremes.findings.some((x) => x.ruleId === "R-A11Y-3")).toBe(false);
  });

  it("visual checks are deterministic", () => {
    const opts = { asOf: ASOF, visual: { altText: "Poster", dominantColors: [{ hex: "#FF1493", share: 0.9 }] }, palette };
    expect(JSON.stringify(review("x", opts))).toBe(JSON.stringify(review("x", opts)));
  });
});

describe("Version diff (F10) — pure module", () => {
  const reconstruct = (segs, drop) =>
    segs.filter((s) => s.type !== drop).map((s) => s.text).join("");

  it("identical texts → a single unchanged segment", () => {
    const segs = diffWords("Guests get 20% off.", "Guests get 20% off.");
    expect(segs).toEqual([{ type: "same", text: "Guests get 20% off." }]);
  });

  it("a replaced number shows as del + add, and round-trips exactly", () => {
    const before = "Guests get 20% off their first order.";
    const after = "Guests get 25% off their first order.";
    const segs = diffWords(before, after);
    expect(reconstruct(segs, "add")).toBe(before);
    expect(reconstruct(segs, "del")).toBe(after);
    const changed = segs.filter((s) => s.type !== "same").map((s) => s.text.trim());
    // Only the digits differ: '%' is identical in both, so it must stay
    // unchanged rather than appearing in both the del and add runs.
    expect(changed).toContain("20");
    expect(changed).toContain("25");
    expect(changed).not.toContain("%");
    // and it is a genuine del/add pair
    expect(segs.some((s) => s.type === "del")).toBe(true);
    expect(segs.some((s) => s.type === "add")).toBe(true);
  });

  it("pure insertion yields only an add segment", () => {
    const before = "Delivery in 2 days.";
    const after = "Delivery in 2 days across 120+ cities.";
    const segs = diffWords(before, after);
    expect(segs.filter((s) => s.type === "del")).toHaveLength(0);
    expect(reconstruct(segs, "del")).toBe(after);
    expect(reconstruct(segs, "add")).toBe(before);
  });

  it("pure deletion yields only a del segment", () => {
    const before = "Beans roasted fresh weekly in Kolkata.";
    const after = "Beans roasted fresh weekly.";
    const segs = diffWords(before, after);
    expect(segs.filter((s) => s.type === "add")).toHaveLength(0);
    expect(reconstruct(segs, "add")).toBe(before);
  });

  it("whitespace-only changes are handled without throwing", () => {
    const segs = diffWords("a b", "a  b");
    expect(reconstruct(segs, "add")).toBe("a b");
    expect(reconstruct(segs, "del")).toBe("a  b");
  });

  it("empty previous version → whole text is an addition (v1 baseline case)", () => {
    const segs = diffWords("", "New draft text.");
    expect(segs).toEqual([{ type: "add", text: "New draft text." }]);
  });

  it("empty current version → whole text is a removal", () => {
    const segs = diffWords("Old draft text.", "");
    expect(segs).toEqual([{ type: "del", text: "Old draft text." }]);
  });

  it("adjacent same-type segments are merged (no flickery output)", () => {
    const segs = diffWords("one two three", "one four five");
    const types = segs.map((s) => s.type);
    for (let i = 1; i < types.length; i++) expect(types[i]).not.toBe(types[i - 1]);
  });

  it("handles multi-line copy, the real content shape", () => {
    const before = "Welcome to Brewloom.\nGuests get 20% off with code WELCOME20.";
    const after = "Welcome to Brewloom.\nGuests get 25% off with code WELCOME25.";
    const segs = diffWords(before, after);
    expect(reconstruct(segs, "add")).toBe(before);
    expect(reconstruct(segs, "del")).toBe(after);
  });

  it("degenerate: two long, wholly-different texts falls back without allocating a huge table", () => {
    const a = Array.from({ length: 900 }, (_, i) => `aaa${i}`).join(" ");
    const b = Array.from({ length: 900 }, (_, i) => `bbb${i}`).join(" ");
    const segs = diffWords(a, b);
    // Coarse fallback: one del block + one add block, still exactly correct.
    expect(reconstruct(segs, "add")).toBe(a);
    expect(reconstruct(segs, "del")).toBe(b);
  });

  it("non-string input never throws", () => {
    expect(() => diffWords(null, undefined)).not.toThrow();
    expect(diffWords(undefined, undefined)).toEqual([]);
    expect(diffWords(42, "x").length).toBeGreaterThan(0);
  });

  it("diff is deterministic", () => {
    const a = "Guests get 20% off.";
    const b = "Guests get 25% off with WELCOME25.";
    expect(JSON.stringify(diffWords(a, b))).toBe(JSON.stringify(diffWords(a, b)));
  });
});

describe("Determinism & purity", () => {
  it("same input → identical output", () => {
    const a = review(ex("example-1").text, { asOf: ASOF });
    const b = review(ex("example-1").text, { asOf: ASOF });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
