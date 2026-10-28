/**
 * Deterministic rule-based checks (F3).
 *
 * Every finding carries a real `ruleId` (or `factId`) and an exact `spanText`
 * that is a substring of the input — the raw material the F5 citation
 * validator verifies. Pure functions: text + config in, findings out.
 */

import { findAll, sentences, wordCount, titleCase, matchCase } from "./text.js";
import { detectFactMentions } from "./facts.js";

const SUGGESTIONS = {
  "R-TONE-2": { OMG: "Exciting news,", lol: "funny", gonna: "going to", wanna: "want to", u: "you" },
};

/** Lexicons. Word-boundary matching; case handled per pattern. */
const Slang = /\b(OMG|lol|gonna|wanna)\b|\b(u)\b/gi;
const Jargon = /\b(synergy|leverage|game-changing|revolutionary|disruptor|ecosystem)\b/gi;
const HealthClaims =
  /\b(boosts?\s+immunity|immunity\s+boost|detox|weight\s+loss|lose\s+weight|cures?\s+\w+)\b/gi;
const Superlatives = /\b(best|fastest|quickest|freshest|#1|100%|guaranteed)\b/gi;
const BannedTerm = /\b(customers|users|clients)\b/gi;
const CheapTerm = /\b(cheap|cheapest)\b/gi;
const BrandVariants = /\b(Brew\s+Loom|BrewLoom|brewloom|brew\s+loom)\b/g;
const LinkText = /\b(?:click\s+here|read\s+more)\b/gi;
const CapsRun = /\b(?:[A-Z]{3,}(?:\s+|$)){2,}/g; // 2+ consecutive ALL-CAPS words
const ExclaimRun = /!{2,}/g;

function finding(partial) {
  return {
    severity: "low",
    confidence: 0.98,
    sourceType: "rule",
    needsHuman: false,
    ...partial,
  };
}

/* ── Tone ──────────────────────────────────────────────────────────── */

function checkTone(text, rules, out) {
  const tone = (id) => rules.find((r) => r.id === id);

  if (tone("R-TONE-1")) {
    for (const m of findAll(text, ExclaimRun)) {
      out.push(
        finding({
          ruleId: "R-TONE-1",
          severity: "low",
          spanText: m[0],
          spanStart: m.index,
          issue: `Excessive punctuation (${m[0].length} consecutive exclamation marks); at most one per piece`,
          suggestion: matchCase(m[0], "!"),
        })
      );
    }
    for (const m of findAll(text, CapsRun)) {
      const span = m[0].trim();
      if (!span) continue;
      out.push(
        finding({
          ruleId: "R-TONE-1",
          severity: "low",
          spanText: span,
          spanStart: text.indexOf(span),
          issue: "ALL-CAPS emphasis is not permitted; use sentence case",
          suggestion: titleCase(span),
        })
      );
    }
  }

  if (tone("R-TONE-2")) {
    for (const m of findAll(text, Slang)) {
      const word = (m[1] ?? m[2] ?? "").toLowerCase();
      out.push(
        finding({
          ruleId: "R-TONE-2",
          severity: "low",
          spanText: m[0],
          spanStart: m.index,
          issue: "Slang / text-speak prohibited in brand copy",
          suggestion: SUGGESTIONS["R-TONE-2"][word] ?? null,
        })
      );
    }
  }

  if (tone("R-TONE-3")) {
    for (const m of findAll(text, Jargon)) {
      out.push(
        finding({
          ruleId: "R-TONE-3",
          severity: "low",
          spanText: m[0],
          spanStart: m.index,
          issue: "Jargon/ buzzword in brand copy; prefer plain language",
          suggestion: null,
        })
      );
    }
    for (const s of sentences(text)) {
      const wc = wordCount(s);
      if (wc > 25) {
        const start = text.indexOf(s);
        out.push(
          finding({
            ruleId: "R-TONE-3",
            severity: "low",
            spanText: s,
            spanStart: start,
            issue: `Sentence is ${wc} words (limit 25)`,
            suggestion: null,
          })
        );
      }
    }
  }
}

/* ── Terms ─────────────────────────────────────────────────────────── */

function checkTerms(text, rules, out) {
  const has = (id) => rules.some((r) => r.id === id);

  if (has("R-TERM-1")) {
    for (const m of findAll(text, BannedTerm)) {
      out.push(
        finding({
          ruleId: "R-TERM-1",
          severity: "medium",
          spanText: m[0],
          spanStart: m.index,
          issue: `Non-preferred term '${m[0]}'; glossary prefers 'guests'`,
          suggestion: matchCase(m[0], "guests"),
        })
      );
    }
  }

  if (has("R-TERM-2")) {
    for (const m of findAll(text, BrandVariants)) {
      if (m[0] === "Brewloom") continue;
      out.push(
        finding({
          ruleId: "R-TERM-2",
          severity: "medium",
          spanText: m[0],
          spanStart: m.index,
          issue: "Brand name written incorrectly; it is 'Brewloom' (one word, capital B)",
          suggestion: "Brewloom",
        })
      );
    }
  }

  if (has("R-TERM-3")) {
    for (const m of findAll(text, CheapTerm)) {
      out.push(
        finding({
          ruleId: "R-TERM-3",
          severity: "low",
          spanText: m[0],
          spanStart: m.index,
          issue: `Non-preferred term '${m[0]}'; glossary prefers 'affordable'`,
          suggestion: matchCase(m[0], "affordable"),
        })
      );
    }
  }
}

/* ── Claims & messaging ────────────────────────────────────────────── */

function checkClaims(text, rules, facts, asOf, out) {
  const has = (id) => rules.some((r) => r.id === id);

  if (has("R-CLAIM-1")) {
    const claimSet = new Set(
      facts
        .filter((f) => f.kind === "claim" && f.validUntil >= asOf)
        .flatMap((f) => f.supports ?? [])
    );
    for (const m of findAll(text, Superlatives)) {
      const word = m[0].toLowerCase();
      if (claimSet.has(word)) continue; // backed by an approved claim (e.g. C-SPEED)
      out.push(
        finding({
          ruleId: "R-CLAIM-1",
          severity: "high",
          spanText: m[0],
          spanStart: m.index,
          issue: `Unsupported superlative/absolute '${m[0]}'; no approved claim backs it`,
          suggestion: null,
          confidence: 0.9,
        })
      );
    }
  }

  if (has("R-CLAIM-2")) {
    for (const m of findAll(text, HealthClaims)) {
      out.push(
        finding({
          ruleId: "R-CLAIM-2",
          severity: "high",
          spanText: m[0],
          spanStart: m.index,
          issue: "Health/medicinal claim prohibited without legal signoff",
          suggestion: "is crafted for a smooth, refreshing daily ritual",
          confidence: 0.92,
        })
      );
    }
  }

  if (has("R-MSG-1")) {
    const competitors = ["Starbucks", "Blue Tokai", "Third Wave Coffee", "Chaayos"];
    const re = new RegExp(`\\b(${competitors.map((c) => c.replace(/ /g, "\\s+")).join("|")})\\b`, "gi");
    for (const m of findAll(text, re)) {
      out.push(
        finding({
          ruleId: "R-MSG-1",
          severity: "high",
          spanText: m[0],
          spanStart: m.index,
          issue: "Named competitor comparison/reference prohibited by messaging policy",
          suggestion: "a leading specialty coffee brand",
          confidence: 0.95,
        })
      );
    }
  }
}

/* ── Accessibility (text-side checks) ──────────────────────────────── */

function checkA11y(text, rules, out) {
  if (!rules.some((r) => r.id === "R-A11Y-2")) return;
  for (const m of findAll(text, LinkText)) {
    out.push(
      finding({
        ruleId: "R-A11Y-2",
        severity: "low",
        spanText: m[0],
        spanStart: m.index,
        issue: "Non-descriptive link text (WCAG 2.4.4)",
        suggestion: "Explore our coffee collection",
      })
    );
  }
}

/* ── Facts (F3 fact checks via citation of real fact IDs) ──────────── */

function checkFacts(text, facts, asOf, out) {
  for (const m of detectFactMentions(text, facts, asOf)) {
    if (m.status === "ok") continue;
    out.push(
      finding({
        ruleId: "R-FACT-1",
        factId: m.factId,
        severity: "high",
        spanText: m.span,
        spanStart: m.spanStart,
        issue:
          m.status === "expired"
            ? `Expired approved fact: ${m.statement} (${m.issue})`
            : `Value contradicts approved fact ${m.factId} (${m.issue})`,
        suggestion: null,
        confidence: 0.99,
      })
    );
  }
}

/* ── Link / terminology glossary word-boundary guard ───────────────── */

/**
 * Run all deterministic checks.
 * @param {string} text content to check
 * @param {{rules: Array, facts: Array, asOf: string}} cfg
 * @returns {Array} raw findings (pre-validation)
 */
export function runChecks(text, { rules, facts, asOf }) {
  const t = String(text ?? "");
  const out = [];
  checkTone(t, rules, out);
  checkTerms(t, rules, out);
  checkClaims(t, rules, facts, asOf, out);
  checkA11y(t, rules, out);
  checkFacts(t, facts, asOf, out);
  // Deterministic order: by position, then ruleId.
  out.sort((a, b) => a.spanStart - b.spanStart || a.ruleId.localeCompare(b.ruleId));
  return out;
}
