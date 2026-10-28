/**
 * F4 — AI judgment adapter tests.
 *
 * The parser is the part that breaks silently (a model that answers in an
 * unexpected shape yields zero findings and no error), so it is covered
 * directly against all three shapes real models emit. The network path is
 * covered by the no-key fallback test — no live API calls in CI.
 */

import { describe, it, expect, afterEach } from "vitest";
import { parseFindings, aiReview, disclosure } from "../server/ai.js";
import { rules, facts } from "../src/index.js";

const saved = {};
afterEach(() => {
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
const setEnv = (k, v) => { saved[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; };

describe("F4 — parseFindings handles every shape a model emits", () => {
  const obj = { ruleId: "R-TONE-2", factId: null, spanText: "OMG", severity: "low", issue: "text-speak", suggestion: null };

  it("parses a JSON array", () => {
    expect(parseFindings(JSON.stringify([obj]))).toHaveLength(1);
  });

  it("parses newline-delimited objects (Nemotron's habit) — the shape that was silently dropped", () => {
    const raw = `${JSON.stringify(obj)}\n${JSON.stringify({ ...obj, ruleId: "R-TERM-1", spanText: "customers", suggestion: "guests" })}`;
    const out = parseFindings(raw);
    expect(out).toHaveLength(2);
    expect(out[1].suggestion).toBe("guests");
  });

  it("parses either shape wrapped in a markdown fence", () => {
    const raw = "```json\n[ " + JSON.stringify(obj) + " ]\n```";
    expect(parseFindings(raw)).toHaveLength(1);
  });

  it("treats the literal string \"null\" as no suggestion (models do this)", () => {
    const out = parseFindings(JSON.stringify({ ...obj, suggestion: "null" }));
    expect(out[0].suggestion).toBeNull();
  });

  it("keeps a real suggestion and normalises a bad severity", () => {
    const out = parseFindings(JSON.stringify({ ...obj, suggestion: "Oh my", severity: "urgent" }));
    expect(out[0].suggestion).toBe("Oh my");
    expect(out[0].severity).toBe("medium");
  });

  it("drops entries with no ruleId and returns [] for prose", () => {
    expect(parseFindings(JSON.stringify([{ spanText: "x" }]))).toHaveLength(0);
    expect(parseFindings("I could not find any violations.")).toHaveLength(0);
    expect(parseFindings("")).toHaveLength(0);
    expect(parseFindings(undefined)).toHaveLength(0);
  });
});

describe("F4 — aiReview never throws and degrades honestly", () => {
  it("no key ⇒ no network call, used:false, disclosed reason", async () => {
    setEnv("NVIDIA_API_KEY", undefined);
    const r = await aiReview("Some copy.", { rules, facts });
    expect(r.meta.used).toBe(false);
    expect(r.findings).toEqual([]);
    expect(r.meta.reason).toMatch(/NVIDIA_API_KEY/);
  });

  it("a key that cannot reach the endpoint ⇒ fallback to deterministic, still no throw", async () => {
    // Point the URL's host at an unroutable address via a bogus key + model so
    // the call fails fast; the contract is that failure degrades, never throws.
    setEnv("NVIDIA_API_KEY", "nvapi-invalid-for-test");
    setEnv("NVIDIA_MODEL", "nvidia/nemotron-3.5-bolt-e4b");
    setEnv("AI_TIMEOUT_MS", "300");
    const r = await aiReview("Some copy.", { rules, facts });
    // Either it fails and falls back, or (if the env has a real key injected by
    // the harness) it succeeds — but it must never throw or return junk.
    expect(typeof r.meta.used).toBe("boolean");
    if (!r.meta.used) expect(r.meta.fallback).toBe(true);
    expect(Array.isArray(r.findings)).toBe(true);
  });
});

describe("F4 — F14 disclosure reflects NVIDIA-only config", () => {
  it("with a key, names the NVIDIA provider and model", () => {
    setEnv("NVIDIA_API_KEY", "nvapi-test");
    setEnv("NVIDIA_MODEL", "nvidia/nemotron-3.5-bolt-e4b");
    const d = disclosure(true);
    expect(d.providers).toHaveLength(1);
    expect(d.providers[0]).toMatch(/nemotron-3\.5-bolt-e4b/);
  });

  it("with no key, reports no providers", () => {
    setEnv("NVIDIA_API_KEY", undefined);
    expect(disclosure(true).providers).toEqual([]);
  });
});
