/**
 * Citation validator (F5) — the centrepiece.
 *
 * No finding is trusted just because a model produced it. A finding is only
 * accepted as-is when BOTH hold:
 *   1. its ruleId/factId exists in the knowledge base (a real rule or fact), and
 *   2. its spanText is an exact substring of the content being reviewed.
 *
 * Anything else is downgraded: severity drops to 'needs-human', it is routed
 * to a Reviewer, and it can never be auto-accepted. Findings that pass keep
 * their severity and are routed normally (F9).
 */

const SEVERITY_ORDER = ["low", "medium", "high"];

function resolveSource(f, rules, facts) {
  if (f.factId) {
    const fact = facts.find((x) => x.id === f.factId);
    if (fact) return { kind: "fact", record: fact };
  }
  const rule = rules.find((x) => x.id === f.ruleId);
  if (rule) return { kind: "rule", record: rule };
  const fact = facts.find((x) => x.id === f.ruleId); // fact cited as ruleId
  if (fact) return { kind: "fact", record: fact };
  return null;
}

function sourceQuote(source) {
  if (source.kind === "rule") {
    return `Guideline ${source.record.id}: '${source.record.text}'`;
  }
  const f = source.record;
  const validity = f.validUntil ? `valid until ${f.validUntil}` : "";
  return `Approved ${f.kind === "claim" ? "Claim" : "Fact"} ${f.id}: '${f.statement}'${validity ? ` (${validity}, Owner: ${f.owner})` : ""}`;
}

/**
 * Validate raw findings against the knowledge base.
 *
 * @param {Array} rawFindings findings from checks and/or an AI model
 * @param {string} content the text the findings claim to be about
 * @param {{rules: Array, facts: Array}} kb knowledge base
 * @returns {Array} validated findings (never throws on garbage input)
 */
export function validateCitations(rawFindings, content, { rules, facts }) {
  const text = String(content ?? "");
  if (!Array.isArray(rawFindings)) return [];

  return rawFindings.map((f, i) => {
    const source = resolveSource(f ?? {}, rules, facts);
    const span = typeof f?.spanText === "string" ? f.spanText : "";
    const spanVerified = span.length > 0 && text.includes(span);

    if (!source || !spanVerified) {
      const reasons = [];
      if (!source) reasons.push(`unknown rule/fact id '${f?.ruleId ?? f?.factId ?? "?"}'`);
      if (!spanVerified) reasons.push("span not found verbatim in the content");
      return {
        ...f,
        id: f.id ?? `nv-${i + 1}`,
        severity: "needs-human",
        needsHuman: true,
        citationVerified: false,
        citationRejectReason: reasons.join("; "),
        sourceQuote: null,
        routedToReviewer: true,
      };
    }

    return {
      ...f,
      id: f.id ?? `v-${i + 1}`,
      severity: f.severity ?? "low",
      needsHuman: false,
      citationVerified: true,
      citationRejectReason: null,
      sourceKind: source.kind,
      sourceId: source.record.id,
      sourceQuote: sourceQuote(source),
    };
  });
}

/**
 * Verified suggestions (F7): a suggestion is only surfaced when re-running the
 * checks on the suggested replacement produces no finding of the same rule at
 * the replaced location, and its "meaning preserved" score clears the bar.
 */
export function verifySuggestion(content, validatedFinding, suggestion, { runChecks, kb, minIntent = 70 }) {
  if (!suggestion || typeof suggestion !== "string") return { shown: false, reason: "no suggestion" };
  const text = String(content ?? "");
  const start = validatedFinding.spanStart;
  if (start == null || start < 0 || !text.slice(start).startsWith(validatedFinding.spanText)) {
    return { shown: false, reason: "span position mismatch" };
  }
  const after = text.slice(0, start) + suggestion + text.slice(start + validatedFinding.spanText.length);
  // A suggestion fails if the same rule still fires inside the replacement.
  const residual = runChecks(after, kb).filter(
    (r) => r.ruleId === validatedFinding.ruleId && suggestion.includes(r.spanText)
  );
  const sameRuleBlocked = residual.length > 0;
  const intent = intentScore(validatedFinding.spanText, suggestion);
  const shown = !sameRuleBlocked && intent >= minIntent;
  return {
    shown,
    text: shown ? suggestion : null,
    intentKept: intent,
    reason: shown ? null : sameRuleBlocked ? "suggestion still violates the rule" : "meaning changed too much",
  };
}

/** Crude meaning-preserved score: how much of the original survives (0-100). */
export function intentScore(original, suggestion) {
  if (!suggestion) return 0;
  const a = new Set(String(original).toLowerCase().split(/\W+/).filter(Boolean));
  const b = new Set(String(suggestion).toLowerCase().split(/\W+/).filter(Boolean));
  if (a.size === 0) return 50;
  let kept = 0;
  for (const w of a) if (b.has(w)) kept += 1;
  // Replacements that swap one term for its glossary counterpart keep meaning.
  const overlap = kept / a.size;
  return Math.round(Math.min(100, overlap * 100 + (kept > 0 ? 15 : 0)));
}

export { SEVERITY_ORDER };
