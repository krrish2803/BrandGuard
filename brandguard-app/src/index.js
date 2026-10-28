/**
 * BrandGuard review engine — pure core (text + knowledge base in, review out).
 *
 * Pipeline:
 *   F3  runChecks          deterministic rule checks
 *   F5  validateCitations  drop/downgrade uncited or non-verbatim findings
 *   F6  → findings carry span, severity, why, source quote, confidence
 *   F7  verifySuggestion   surface a fix only if it re-checks clean
 *   F9  route              high/needs-human → Reviewer, else Manager
 *   F12 factscan/reverseAlerts live in ./factscan.js
 *   F16 runVisualChecks    image checks (opts.visual) live in ./visual.js
 *   F10 diffWords          version diff for the detail screen, in ./diff.js
 *
 * No server, no database, no network — every export is deterministic and
 * testable with `vitest`.
 */

import { rules as seedRules, facts as seedFacts, palette as seedPalette, defaultAsOf } from "./seed.js";
import { runChecks } from "./checks.js";
import { validateCitations, verifySuggestion } from "./validator.js";
import { runVisualChecks, mergeVisual } from "./visual.js";
import { diffWords } from "./diff.js";
import { factscan, reverseAlerts, groupAlertsByOwner } from "./factscan.js";
import { detectFactMentions, problematicMentions, expiredFacts } from "./facts.js";

/**
 * Review one piece of content.
 *
 * @param {string} text the content
 * @param {object} [opts]
 * @param {Array}  [opts.rules]   knowledge-base rules (default: Brewloom seed)
 * @param {Array}  [opts.facts]   knowledge-base facts  (default: Brewloom seed)
 * @param {string} [opts.asOf]    demo date, 'YYYY-MM-DD' (default: today)
 * @param {string} [opts.channel] channel label (metadata only)
 * @param {object} [opts.visual]  extracted image facts (F16): { altText,
 *                 dominantColors: [{hex, share}], textColor, bgColor, width, height }
 * @param {Array}  [opts.palette] brand palette (default: Brewloom seed)
 * @param {Array}  [opts.aiFindings] extra findings from an AI model — these go
 *                 through the same F5 citation validator as deterministic ones.
 * @returns {{findings: Array, counts: object, route: string, approvable: boolean}}
 */
export function review(text, opts = {}) {
  const rules = opts.rules ?? seedRules;
  const facts = opts.facts ?? seedFacts;
  const asOf = opts.asOf ?? defaultAsOf();
  const kb = { rules, facts, asOf };

  // F3: deterministic findings + any AI-supplied findings
  const raw = [...runChecks(text, kb), ...(Array.isArray(opts.aiFindings) ? opts.aiFindings : [])];

  // F5: nothing survives without a real citation and a verbatim span
  const validated = validateCitations(raw, text, { rules, facts });

  // F16: image checks. These come *after* validation on purpose — their
  // evidence is a measurement (contrast ratio, palette distance), not a
  // span of the text, so the text-span validator doesn't apply to them.
  // They cite real rules and carry their measured evidence as the quote.
  const visualFindings = opts.visual
    ? runVisualChecks(opts.visual, { rules, palette: opts.palette ?? seedPalette })
    : [];

  // F6 + F7: attach verified suggestions (only shown when they re-check clean)
  const textFindings = validated.map((f) => {
    if (f.needsHuman || !f.suggestion) {
      return { ...f, suggestionShown: false, verifiedSuggestion: null };
    }
    const v = verifySuggestion(text, f, f.suggestion, { runChecks, kb });
    return {
      ...f,
      suggestionShown: v.shown,
      verifiedSuggestion: v.shown ? v.text : null,
      intentKept: v.shown ? v.intentKept : null,
    };
  });

  // Tag visual findings with stable ids (same scheme as the server tags
  // text findings) so per-finding decisions and receipts work on them too.
  const taggedVisual = visualFindings.map((f, i) => ({
    ...f,
    id: f.id ?? `vis-${String(i + 1).padStart(3, "0")}`,
  }));

  const findings = mergeVisual(textFindings, taggedVisual);

  // F6 summary
  const counts = { high: 0, medium: 0, low: 0, "needs-human": 0, total: findings.length };
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;

  // F9 routing: any high or unverifiable finding demands a Reviewer;
  // medium/low with citations stops at the Manager; nothing → auto-approve path.
  const needsReviewer = findings.some((f) => f.severity === "high" || f.needsHuman);
  const route = needsReviewer ? "Reviewer" : findings.length > 0 ? "Manager" : "Manager";
  const approvable = !needsReviewer;

  return {
    channel: opts.channel ?? null,
    asOf,
    counts,
    route,
    approvable,
    findings,
    // "clean" = no findings at all (Example 2)
    clean: findings.length === 0,
  };
}

export {
  runChecks,
  validateCitations,
  verifySuggestion,
  runVisualChecks,
  mergeVisual,
  diffWords,
  factscan,
  reverseAlerts,
  groupAlertsByOwner,
  detectFactMentions,
  problematicMentions,
  expiredFacts,
};

export { seedRules as rules, seedFacts as facts, seedPalette as palette, defaultAsOf };
