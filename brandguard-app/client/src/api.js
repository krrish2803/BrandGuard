/**
 * API client for the BrandGuard server.
 *
 * One place that knows every endpoint the screens use. The active role is
 * attached as a Bearer token (issued by POST /api/session) so the server —
 * not the browser — decides what each role may do.
 */

const TOKEN_KEY = "brandguard.session";

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) ?? "null");
  } catch {
    return null;
  }
}

export function setSession(session) {
  if (session) localStorage.setItem(TOKEN_KEY, JSON.stringify(session));
  else localStorage.removeItem(TOKEN_KEY);
}

export async function switchRole(role, name) {
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, name }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `session ${res.status}`);
  const session = await res.json();
  setSession(session);
  return session;
}

const REQUEST_TIMEOUT_MS = 60000;

async function call(method, path, body, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const session = getSession();
  // F18: never let a hung request spin the UI forever. AbortController gives
  // us a hard timeout that surfaces as a readable error, not a frozen spinner.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(path, {
      method,
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") {
      const err = new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s — the server may be busy`);
      err.status = 408;
      throw err;
    }
    throw new Error(`Could not reach the server — is it running on :4000? (${e.message})`);
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error ?? `${method} ${path} → ${res.status}`);
    err.status = res.status;
    err.detail = data;
    throw err;
  }
  return data;
}

export const api = {
  health: () => call("GET", "/api/health"),
  kb: () => call("GET", "/api/kb"),
  examples: () => call("GET", "/api/examples"),
  insights: () => call("GET", "/api/insights"),
  ruleFindings: (ruleId) => call("GET", `/api/insights/rules/${encodeURIComponent(ruleId)}`),
  alerts: () => call("GET", "/api/alerts"),
  audit: (contentId) => call("GET", `/api/audit${contentId ? `?contentId=${encodeURIComponent(contentId)}` : ""}`),
  disclosure: () => call("GET", "/api/ai/disclosure"),

  review: (payload) => call("POST", "/api/review", payload),
  contents: () => call("GET", "/api/contents"),
  content: (id) => call("GET", `/api/contents/${encodeURIComponent(id)}`),
  receipt: (id) => call("GET", `/api/contents/${encodeURIComponent(id)}/receipt`),

  findingDecision: (findingId, payload) =>
    call("POST", `/api/findings/${encodeURIComponent(findingId)}/decision`, payload),
  submit: (id, payload) => call("POST", `/api/contents/${encodeURIComponent(id)}/submit`, payload),
  approve: (id, payload) => call("POST", `/api/contents/${encodeURIComponent(id)}/approve`, payload),
  requestChanges: (id, payload) =>
    call("POST", `/api/contents/${encodeURIComponent(id)}/request-changes`, payload),
  comment: (id, payload) => call("POST", `/api/contents/${encodeURIComponent(id)}/comments`, payload),

  updateFact: (id, payload) => call("PUT", `/api/facts/${encodeURIComponent(id)}`, payload),
  createFact: (payload) => call("POST", "/api/facts", payload),
  moveDemoDate: (demoDate) => call("POST", "/api/settings/demo-date", { demoDate }),
  ackAlert: (id) => call("POST", `/api/alerts/${encodeURIComponent(id)}/ack`, {}),

  agentCheck: (text, channel) => call("POST", "/api/agent/check", { text, channel }),
  agentContext: () => call("GET", "/api/agent/context"),
};
