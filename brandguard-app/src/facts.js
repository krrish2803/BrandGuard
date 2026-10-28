/**
 * Fact detection & validation (supports F3 fact checks and F12 reverse alerts).
 *
 * A fact mention is a span of text that asserts something an approved fact can
 * be compared against: an offer percentage, a delivery day count, a city count,
 * a free-delivery threshold, a sale phrase, or an approved claim pattern.
 *
 * Status of a mention:
 *   'ok'       — value matches the approved value and the fact is in date
 *   'mismatch' — value differs from the approved value
 *   'expired'  — the fact's validity date has passed (as of `asOf`)
 */

import { findAll, formatDate, isExpired } from "./text.js";

/** Numeric claim patterns per detect type. First match wins for `days`. */
const DAY_PATTERNS = [
  /delivers?\s+in\s+(\d+)\s+days?\b/gi,
  /delivery\s+(?:in|takes)\s+(\d+)\s+days?\b/gi,
  /takes\s+(\d+)\s+days?\b/gi,
  /\bin\s+(\d+)\s+days?\b/gi,
];

function firstMatch(text, patterns) {
  let best = null;
  for (const re of patterns) {
    for (const m of findAll(text, re)) {
      if (!best || m.index < best.index) best = m;
    }
  }
  return best;
}

function percentValue(span) {
  const m = span.match(/(\d{1,3})\s*%/);
  return m ? Number(m[1]) : null;
}

/** Find the `N% off` claims in a text, excluding those owned by a sale phrase. */
function percentMentions(text, ownedByPhrase) {
  return findAll(text, /(\d{1,3})\s*%\s*off\b/gi).map((m) => ({
    span: m[0],
    spanStart: m.index,
    value: Number(m[1]),
    ownedByPhrase,
  }));
}

function mentionForFact(fact, text, asOf, phraseClaimsPercents) {
  const detect = fact.detect || {};
  let span = null;
  let spanStart = -1;
  let value = null;

  if (detect.type === "percent") {
    if (detect.requiresPhrase) {
      const phrase = text.match(detect.requiresPhrase);
      if (!phrase) return null;
      span = phrase[0];
      spanStart = phrase.index;
      // Attribute the nearest "N% off" in the sale context to this fact.
      const pct = firstMatch(text, [/(\d{1,3})\s*%\s*off\b/gi]);
      value = pct ? Number(pct[1]) : null;
      phraseClaimsPercents.used = true;
    } else if (!phraseClaimsPercents.used) {
      const pct = firstMatch(text, [/(\d{1,3})\s*%\s*off\b/gi]);
      if (!pct) return null;
      span = pct[0];
      spanStart = pct.index;
      value = Number(pct[1]);
    } else {
      return null; // percent already attributed to a sale phrase fact
    }
  } else if (detect.type === "days") {
    const m = firstMatch(text, DAY_PATTERNS);
    if (!m) return null;
    span = m[0];
    spanStart = m.index;
    value = Number(m[1]);
  } else if (detect.type === "cities") {
    const m = firstMatch(text, [/(\d{1,4})\+?\s*cities\b/gi]);
    if (!m) return null;
    span = m[0];
    spanStart = m.index;
    value = Number(m[1]);
  } else if (detect.type === "freeAbove") {
    const m = firstMatch(text, [
      /free\s+delivery\s+on\s+orders\s+above\s+(?:rs\.?\s*|₹\s*)?(\d{1,6})/gi,
      /free\s+delivery\s+above\s+(?:rs\.?\s*|₹\s*)?(\d{1,6})/gi,
    ]);
    if (!m) return null;
    span = m[0];
    spanStart = m.index;
    value = Number(m[1]);
  } else if (detect.type === "claim" || detect.type === "phrase") {
    if (!detect.pattern) return null;
    const m = firstMatch(text, [detect.pattern]);
    if (!m) return null;
    span = m[0];
    spanStart = m.index;
  } else {
    return null;
  }

  const expired = isExpired(fact, asOf);
  const mismatch = value !== null && fact.approved !== null && value !== fact.approved;
  const status = expired ? "expired" : mismatch ? "mismatch" : "ok";

  const issues = [];
  if (expired) issues.push(`expired on ${formatDate(fact.validUntil)}`);
  if (mismatch) issues.push(`value ${value} does not match approved ${fact.approved}`);

  return {
    factId: fact.id,
    statement: fact.statement,
    owner: fact.owner,
    validUntil: fact.validUntil,
    span,
    spanStart,
    value,
    approved: fact.approved,
    status,
    issue: issues.length ? issues.join("; ") : null,
  };
}

/**
 * Detect every fact mention in `text`.
 * Sale phrases (facts with `requiresPhrase`) claim any "N% off" in the same
 * text so "30% off during Monsoon Sale" is judged against F-SALE, not F-OFFER.
 *
 * @returns {Array<{factId, span, spanStart, value, status, issue, ...}>}
 */
export function detectFactMentions(text, facts, asOf) {
  const t = String(text ?? "");
  const phraseClaimsPercents = { used: false };
  // Sale-phrase facts first so they claim the percent claims.
  const ordered = [...facts].sort(
    (a, b) => Boolean(b.detect?.requiresPhrase) - Boolean(a.detect?.requiresPhrase)
  );
  const out = [];
  for (const fact of ordered) {
    const mention = mentionForFact(fact, t, asOf, phraseClaimsPercents);
    if (mention) out.push(mention);
  }
  // Preserve fact-table order in the output.
  const order = new Map(facts.map((f, i) => [f.id, i]));
  return out.sort((a, b) => (order.get(a.factId) ?? 0) - (order.get(b.factId) ?? 0));
}

/** Mentions that are wrong right now (expired or mismatched). */
export function problematicMentions(text, facts, asOf) {
  return detectFactMentions(text, facts, asOf).filter((m) => m.status !== "ok");
}

/** Facts whose validity date has passed as of `asOf`. */
export function expiredFacts(facts, asOf) {
  return facts.filter((f) => isExpired(f, asOf));
}
