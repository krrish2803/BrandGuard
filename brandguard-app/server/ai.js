/**
 * AI judgment adapter (F4) with mandatory fallback (F18).
 *
 * Sends ONLY the retrieved rules + facts relevant to the content (never the
 * whole knowledge base) and asks the model for JSON findings. Every finding
 * it returns is still passed through the F5 citation validator — the model
 * cannot introduce a rule or fact that does not exist.
 *
 * Provider: NVIDIA NIM only (OpenAI-compatible /chat/completions).
 *   • NVIDIA_API_KEY set   → call the model (NVIDIA_MODEL, default below)
 *   • no key / call fails  → { used:false } and the deterministic checks
 *                            still run, and the reason is disclosed
 *
 * All calls: timeout, one retry, then fallback. No key ⇒ no error, no delay.
 */

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

// Default to a model that is live on NVIDIA's gateway. NVIDIA retires models
// (meta/llama-3.1-70b-instruct hit EOL in Aug 2026), so this is overridable
// via NVIDIA_MODEL without a code change.
const DEFAULT_NVIDIA_MODEL = "nvidia/llama-3.1-nemotron-70b-instruct";

// Read lazily so AI_TIMEOUT_MS is honoured even when set after import (tests,
// per-request tuning). NVIDIA's larger reasoning models need >8s to answer.
function timeoutMs() {
  return Number(process.env.AI_TIMEOUT_MS ?? 30000);
}

const SYSTEM_PROMPT = `You are a brand-governance reviewer. You may ONLY cite the
guideline rule IDs and fact IDs provided below. For each violation return JSON:
{"ruleId":"...","factId":"...|null","spanText":"exact substring of the content",
"severity":"low|medium|high","issue":"why it violates","suggestion":"replacement or null"}.
spanText MUST appear verbatim in the content. If unsure, return an empty array.
Respond with JSON only.`;

function buildContext({ text, rules, facts }) {
  const compactRules = rules.map((r) => `${r.id} [${r.severity}] ${r.text}`).join("\n");
  const compactFacts = facts
    .map((f) => `${f.id} = ${f.statement} (approved: ${f.approved ?? "n/a"}, until ${f.validUntil})`)
    .join("\n");
  return `RULES:\n${compactRules}\n\nFACTS:\n${compactFacts}\n\nCONTENT:\n"""\n${text}\n"""\n\nJSON findings:`;
}

/**
 * Pull findings out of a model response.
 *
 * Models emit three shapes in practice, so accept all of them rather than
 * silently returning nothing (a parser that expects only `[...]` drops every
 * finding from a model that answers with one object per line):
 *   1. a JSON array:                [{...}, {...}]
 *   2. newline-delimited objects:   {...}\n{...}     (Nemotron's habit)
 *   3. either of the above inside a ```json fence
 * Anything unparseable → [] so the deterministic checks still stand.
 */
function parseFindings(raw) {
  let text = String(raw ?? "");

  // Strip a markdown code fence if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1];

  const objects = extractObjects(text);
  return objects
    .filter((f) => f && typeof f === "object" && typeof f.ruleId === "string")
    .map((f) => ({
      ruleId: f.ruleId,
      factId: typeof f.factId === "string" ? f.factId : null,
      spanText: typeof f.spanText === "string" ? f.spanText : "",
      severity: ["low", "medium", "high"].includes(f.severity) ? f.severity : "medium",
      issue: typeof f.issue === "string" ? f.issue : "flagged by AI review",
      // A model often writes "null" as a literal string; treat that as no
      // suggestion rather than proposing the word "null" to the reviewer.
      suggestion: typeof f.suggestion === "string" && f.suggestion !== "null" && f.suggestion.trim() !== ""
        ? f.suggestion
        : null,
      source: "ai",
      confidence: typeof f.confidence === "number" ? f.confidence : 0.7,
    }));
}

/** Best-effort: return an array of parsed objects from text. */
function extractObjects(text) {
  // Shape 1 — a top-level JSON array.
  const bracket = text.match(/\[[\s\S]*\]/);
  if (bracket) {
    try {
      const arr = JSON.parse(bracket[0]);
      if (Array.isArray(arr)) return arr;
    } catch { /* fall through to the line-by-line parse */ }
  }
  // Shapes 2 & 3 — one object per line (also tolerates an array's lines).
  const out = [];
  for (const line of text.split("\n")) {
    const s = line.trim().replace(/^[-*,]\s*/, ""); // drop bullets/commas
    if (!s.startsWith("{")) continue;
    try {
      const o = JSON.parse(s.replace(/,\s*$/, ""));
      if (o && typeof o === "object") out.push(o);
    } catch { /* not this line; keep going */ }
  }
  return out;
}

async function fetchWithTimeout(url, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs());
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callNvidia(prompt) {
  const model = process.env.NVIDIA_MODEL || DEFAULT_NVIDIA_MODEL;
  const res = await fetchWithTimeout(NVIDIA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: 1024,
    }),
  });
  if (!res.ok) throw new Error(`nvidia HTTP ${res.status} (${model})`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

async function withRetry(fn) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/**
 * Run AI judgment. Never throws — always resolves with a meta descriptor.
 * @returns {{findings: Array, meta: object}}
 */
// Exported for tests: the parser is where model-format quirks bite, so it is
// covered directly rather than only through the network path.
export { parseFindings };

export function redactPii(text) {
  return String(text ?? "")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL REDACTED]")
    .replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[PHONE REDACTED]");
}

export async function aiReview(text, { rules, facts }) {
  // Single provider (NVIDIA NIM). No key ⇒ skip the network entirely so the
  // app never stalls or errors when AI isn't configured.
  if (!process.env.NVIDIA_API_KEY) {
    return {
      findings: [],
      meta: {
        used: false,
        provider: null,
        model: null,
        reason: "AI not configured — set NVIDIA_API_KEY to enable AI judgment (deterministic checks still ran)",
      },
    };
  }

  const model = process.env.NVIDIA_MODEL || DEFAULT_NVIDIA_MODEL;
  const isRedact = process.env.AI_REDACT_PII === "1";
  const cleanedText = isRedact ? redactPii(text) : text;
  const prompt = buildContext({ text: cleanedText, rules, facts });
  const started = Date.now();
  const attempts = [];

  try {
    const raw = await withRetry(() => callNvidia(prompt));
    const findings = parseFindings(raw);
    return {
      findings,
      meta: {
        used: true,
        provider: "nvidia",
        model,
        durationMs: Date.now() - started,
        retrievedRules: rules.length,
        retrievedFacts: facts.length,
        fieldsSent: ["content.text"],
        reason: null,
      },
    };
  } catch (err) {
    attempts.push(`nvidia: ${err?.message ?? err}`);
  }

  // Fallback (F18): deterministic checks still run; say so honestly.
  return {
    findings: [],
    meta: {
      used: false,
      provider: null,
      model,
      durationMs: Date.now() - started,
      fallback: true,
      attempts,
      reason: "AI call failed; deterministic checks only",
    },
  };
}

/** F14 — what the AI sees and stores. */
export function disclosure(aiEnabled) {
  const model = process.env.NVIDIA_MODEL || DEFAULT_NVIDIA_MODEL;
  // The model id already carries the "nvidia/" org prefix (e.g.
  // "nvidia/nemotron-3.5-bolt-e4b"), so don't prefix it again.
  const label = model.startsWith("nvidia/") ? model : `nvidia/${model}`;
  const providers = process.env.NVIDIA_API_KEY ? [`${label} (NVIDIA NIM)`] : [];
  return {
    aiEnabled,
    providers,
    dataSent: {
      toProvider: ["content text", "retrieved guideline rules", "retrieved approved facts"],
      neverSent: ["user identities", "decision history", "audit log", "database contents"],
    },
    redaction: process.env.AI_REDACT_PII === "1" ? "on (email addresses and phone numbers masked before send)" : "off",
    redactedItems: ["email addresses", "phone numbers"],
    stored: ["provider used", "model", "latency", "which fields were sent", "model-returned findings (post-F5-validation)"],
    fallback: "on provider failure or no key: deterministic checks only, disclosed in the response",
    validation: "every AI finding re-checked by the citation validator (F5); unverifiable → needs-human",
  };
}
