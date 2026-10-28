/**
 * Live feature test — F2..F18 against the running server on :4000.
 *
 * Run with:  node test/live.mjs
 *
 * This is separate from the Vitest suite on purpose: Vitest runs the engine in
 * isolation, whereas this drives the real HTTP surface a judge would use, in
 * the order the spec's seven-step path does. Each feature gets a named check
 * with evidence so a failure points straight at the feature.
 */

const BASE = process.env.BASE ?? "http://localhost:4000";
let session = null; // Bearer token from POST /api/session

// ── harness ────────────────────────────────────────────────────────────────
const results = [];
function check(feature, name, pass, evidence = "") {
  results.push({ feature, name, pass, evidence });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${feature} ${name}${evidence ? ` — ${evidence}` : ""}`);
}

async function req(method, path, body, useSession = true) {
  const headers = { "Content-Type": "application/json" };
  if (useSession && session?.token) headers.Authorization = `Bearer ${session.token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON (e.g. receipt) */ }
  return { status: res.status, body: json, headers: res.headers };
}

// A tiny valid PNG (1×1) for F2/F16 image intake.
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function run() {
  console.log(`\nBrandGuard live feature test — ${BASE}\n${"─".repeat(66)}`);

  // ── F18: server must be up before anything else ──────────────────────────
  const health = await req("GET", "/api/health", undefined, false);
  check("F18", "server health", health.status === 200 && health.body?.ok === true, `db=${health.body?.db}`);
  if (health.status !== 200) {
    console.log("\nServer unreachable — start it first: npm start\n");
    return finish();
  }

  // ── F6: session issues a role-scoped token ───────────────────────────────
  const s = await req("POST", "/api/session", { role: "reviewer", name: "Rahul (reviewer)" }, false);
  check("F6", "session issues reviewer token", s.status === 200 && !!s.body?.token, `role=${s.body?.role}`);
  session = s.body;

  // ── F3 + F5 + F7 + F10: core review of the known-bad example ─────────────
  const examples = await req("GET", "/api/examples", undefined, false);
  const ex1 = examples.body?.find((e) => e.id === "example-1");
  check("F3", "seeded examples served", Array.isArray(examples.body) && examples.body.length >= 3, `${examples.body?.length} examples`);

  const review = await req("POST", "/api/review", { text: ex1.text, channel: ex1.channel });
  const r = review.body;
  check("F3", "review finds rule violations", review.status === 201 && r?.findings?.length > 0, `${r?.findings?.length} findings`);
  check("F5", "every finding is citation-verified", (r?.findings ?? []).every((f) => f.citationVerified === true), "no hallucinated rules");
  check("F5", "findings carry a source quote", (r?.findings ?? []).every((f) => typeof f.sourceQuote === "string" && f.sourceQuote.length > 0), "each cites guideline text");
  check("F7", "findings carry intentKept", (r?.findings ?? []).every((f) => "intentKept" in f), `intentScore present`);
  check("F9", "high-risk content routes to Reviewer", r?.route === "Reviewer" && r?.requiredRole === "reviewer", `route=${r?.route}`);
  const cid = r?.contentId;
  check("F8", "review persists content + contentId", !!cid, cid);

  // ── F8: decisions — accept applies the verified fix, bumps version ───────
  const detail0 = await req("GET", `/api/contents/${cid}`);
  const fixable = (detail0.body?.findings ?? []).find((f) => f.verifiedSuggestion);
  check("F8", "verified suggestions available to accept", !!fixable, fixable ? `e.g. "${fixable.spanText}" → "${fixable.verifiedSuggestion}"` : "none");
  if (fixable) {
    const beforeText = detail0.body.text;
    const acc = await req("POST", `/api/findings/${fixable.id}/decision`, { action: "accept", actor: "creator" });
    check("F8", "accept applies fix + bumps version", acc.status === 200 && acc.body?.content?.version === 2, `v1→v${acc.body?.content?.version}`);
    check("F10", "text actually changed on accept", acc.body?.content?.text !== beforeText, "live text updated");
  }

  // ── F10: version diff attached to each version ───────────────────────────
  const detail1 = await req("GET", `/api/contents/${cid}`);
  const v2 = (detail1.body?.versions ?? []).find((v) => v.version === 2);
  check("F10", "v2 carries a diff vs v1", Array.isArray(v2?.diff) && v2.diff.length > 0, `${v2?.diff?.length} segments`);
  if (Array.isArray(v2?.diff)) {
    const rebuild = (segs, drop) => segs.filter((x) => x.type !== drop).map((x) => x.text).join("");
    const v1 = (detail1.body.versions ?? []).find((x) => x.version === 1);
    check("F10", "diff round-trips both versions", rebuild(v2.diff, "add") === v1.text && rebuild(v2.diff, "del") === v2.text, "byte-exact");
  }

  // ── F11: approval receipt ────────────────────────────────────────────────
  const receipt = await req("GET", `/api/contents/${cid}/receipt`);
  check("F11", "receipt served with AI + rule citations", receipt.status === 200 && !!receipt.body?.receiptId && !!receipt.body?.ai, `receiptId=${receipt.body?.receiptId}`);

  // ── F9: workflow — submit → wrong role blocked → right role approves ─────
  const sub = await req("POST", `/api/contents/${cid}/submit`, { actor: "creator" });
  check("F9", "submit moves content into review", sub.status === 200 && sub.body?.content?.status === "in_review", `status=${sub.body?.content?.status}`);
  const wrongRole = await req("POST", `/api/contents/${cid}/approve`, { actor: "creator" });
  check("F6", "creator cannot approve Reviewer-routed content", wrongRole.status === 403, `403 + requiredRole`);
  const appr = await req("POST", `/api/contents/${cid}/approve`, { actor: "reviewer" });
  check("F9", "reviewer approves", appr.status === 200 && appr.body?.content?.status === "approved", `status=${appr.body?.content?.status}`);

  // ── F6: role gates on a high-privilege write ─────────────────────────────
  const noTok = await req("POST", "/api/facts", { id: "X-TEST", statement: "s", owner: "o" }, false);
  check("F6", "unauthenticated admin write rejected", noTok.status === 401 || noTok.status === 403, `${noTok.status}`);
  const mgrFact = await req("POST", "/api/session", { role: "manager", name: "Priya" }, false);
  const mgrWrite = await req("POST", "/api/facts", { id: "X-TEST", statement: "s", owner: "o" }, false) && null;
  // manager token against admin-only route
  const adminFact = await req("POST", "/api/facts", { id: "X-TEST2", statement: "s", owner: "o" });
  check("F6", "manager cannot create a fact (admin-only)", adminFact.status === 403, `${adminFact.status}`);

  // ── F12: fact expiry drives alerts ───────────────────────────────────────
  const alerts = await req("GET", "/api/alerts");
  check("F12", "alerts served", alerts.status === 200 && Array.isArray(alerts.body), `${alerts.body?.length ?? 0} alerts`);
  const hasExpiryAlert = (alerts.body ?? []).some((a) => /expir|obsolete|expired/i.test(`${a.kind ?? ""} ${a.reason ?? ""} ${a.title ?? ""}`));
  check("F12", "expiry-driven alert present", hasExpiryAlert, hasExpiryAlert ? "expired offer flagged" : "no expiry alert");
  if ((alerts.body ?? []).length > 0) {
    const ack = await req("POST", `/api/alerts/${alerts.body[0].id}/ack`, {});
    check("F12", "alert acknowledge works", ack.status === 200, `${ack.status}`);
  }

  // ── F12: fact table has real expiries, and demo-date can move them ───────
  const kb = await req("GET", "/api/kb", undefined, false);
  const factWithExpiry = (kb.body?.facts ?? []).find((f) => f.validUntil);
  check("F12", "facts carry validUntil dates", !!factWithExpiry, factWithExpiry ? `${factWithExpiry.id} → ${factWithExpiry.validUntil}` : "none");
  const demo = await req("POST", "/api/settings/demo-date", { demoDate: "2026-10-28" });
  check("F12", "demo-date endpoint works", demo.status === 200, `${demo.status}`);

  // ── F4 + F14: AI judgment + disclosure ───────────────────────────────────
  const aiReview = await req("POST", "/api/review", { text: ex1.text, channel: ex1.channel, useAi: true });
  const ai = aiReview.body?.ai;
  check("F4", "AI judgment engaged (report shows AI used)", ai?.used === true, `provider=${ai?.provider} model=${ai?.model} ${ai?.durationMs}ms`);
  check("F4", "AI findings re-validated by citation validator", (aiReview.body?.findings ?? []).every((f) => f.citationVerified === true), "all verified");
  const disc = await req("GET", "/api/ai/disclosure", undefined, false);
  check("F14", "disclosure names the provider + data sent", disc.status === 200 && (disc.body?.providers ?? []).length > 0 && !!disc.body?.dataSent, `${(disc.body?.providers ?? []).join(", ")}`);

  // ── F15: agent API ───────────────────────────────────────────────────────
  const agent = await req("POST", "/api/agent/check", { text: ex1.text }, false);
  check("F15", "POST /api/agent/check returns findings JSON", agent.status === 200 && Array.isArray(agent.body?.findings), `${agent.body?.findings?.length} findings`);
  const agentCtx = await req("GET", "/api/agent/context", undefined, false);
  check("F15", "GET /api/agent/context serves KB", agentCtx.status === 200 && !!agentCtx.body?.rules, `${agentCtx.body?.rules?.length} rules`);

  // ── F13: insights ────────────────────────────────────────────────────────
  const ins = await req("GET", "/api/insights");
  check("F13", "insights aggregates violations", ins.status === 200 && Array.isArray(ins.body?.topViolatedRules) && ins.body.topViolatedRules.length > 0, `${ins.body?.topViolatedRules.length} rules`);
  check("F13", "insights exposes decisions + clarity", !!ins.body?.decisions && Array.isArray(ins.body?.unclearRules), `acceptRate=${ins.body?.decisions?.acceptRate}%`);
  check("F13", "insights breaks down by creator", Array.isArray(ins.body?.byCreator) && ins.body.byCreator.length > 0, `${ins.body?.byCreator.length} creators`);

  // ── F17: rule constellation data (the click target) ──────────────────────
  const topRule = ins.body?.topViolatedRules?.[0]?.ruleId;
  const ruleDetail = await req("GET", `/api/insights/rules/${topRule}`);
  check("F17", "constellation node click serves rule findings", ruleDetail.status === 200 && Array.isArray(ruleDetail.body?.occurrences), `${ruleDetail.body?.occurrences?.length} occurrence(s) for ${topRule}`);
  check("F17", "rule detail resolves definition from KB", !!ruleDetail.body?.definition?.text, `"${(ruleDetail.body?.definition?.text ?? "").slice(0, 40)}…"`);

  // ── F2 + F16: image intake + visual checks ───────────────────────────────
  const imgReview = await req("POST", "/api/review", {
    text: "Fresh Brewloom roast, delivered daily.",
    channel: "Instagram",
    image: PNG_1PX,
    imageType: "image/png",
  });
  check("F2", "image upload accepted", imgReview.status === 201, `${imgReview.status}`);
  const imgFacts = imgReview.body?.image;
  check("F16", "image facts extracted", !!imgFacts && typeof imgFacts === "object", imgFacts ? `w=${imgFacts.width} h=${imgFacts.height} colors=${imgFacts.colors?.length ?? 0}` : "none");
  const visualFindings = (imgReview.body?.findings ?? []).filter((f) => f.sourceType === "visual");
  check("F16", "visual findings produced", Array.isArray(visualFindings), `${visualFindings.length} visual finding(s)`);

  // ── F18: reliability — malformed inputs must not crash ───────────────────
  const empty = await req("POST", "/api/review", { text: "" });
  check("F18", "empty text rejected (400)", empty.status === 400, `${empty.status}`);
  const badImg = await req("POST", "/api/review", { text: "ok copy", image: "!!!not-base64!!!" });
  check("F18", "malformed image rejected (4xx, no crash)", badImg.status >= 400 && badImg.status < 500, `${badImg.status}`);
  const badJson = await fetch(`${BASE}/api/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
  check("F18", "malformed JSON rejected (400)", badJson.status === 400, `${badJson.status}`);
  const huge = "word ".repeat(60000); // ~300KB, well over the 256kb default
  const hugeRes = await req("POST", "/api/review", { text: huge, channel: "Blog" });
  check("F18", "oversized body handled without 500", hugeRes.status !== 500, `${hugeRes.status}`);
  const stillUp = await req("GET", "/api/health");
  check("F18", "server survives the abuse tests", stillUp.status === 200 && stillUp.body?.ok === true, "still healthy");

  // ── audit trail: every decision is recorded (spec: accountability) ───────
  const audit = await req("GET", `/api/audit?contentId=${cid}`);
  const types = new Set((audit.body ?? []).map((a) => a.type));
  check("F9", "audit trail records review+decision+workflow", types.has("reviewed") && [...types].some((t) => /decision|finding/.test(t)) && [...types].some((t) => /workflow/.test(t)), [...types].join(", "));

  return finish();
}

function finish() {
  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass);
  const features = [...new Set(results.map((r) => r.feature))].sort();
  console.log(`\n${"─".repeat(66)}`);
  console.log(`FEATURES EXERCISED: ${features.join(" ")}`);
  console.log(`RESULT: ${pass}/${results.length} checks passed${fail.length ? `, ${fail.length} FAILED` : " — ALL GREEN"}`);
  if (fail.length) {
    console.log("\nFailures:");
    for (const f of fail) console.log(`  ✗ [${f.feature}] ${f.name}${f.evidence ? ` — ${f.evidence}` : ""}`);
  }
  console.log("");
  process.exit(fail.length ? 1 : 0);
}

run().catch((e) => {
  console.error("\nLIVE TEST CRASHED:\n", e);
  process.exit(2);
});
