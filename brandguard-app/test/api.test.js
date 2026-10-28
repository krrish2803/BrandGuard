process.env.BRANDGUARD_FORCE_MEMORY = "1";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { boot } from "../server/app.js";
import { initDb, closeDb, resetDb } from "../server/db.js";
import { encodePng } from "../server/image.js";
import { examples } from "../src/seed.js";

let app;
const ex = (id) => examples.find((e) => e.id === id);

/** Review helper → returns full contentId + findings (with ids). */
async function review(text, extra = {}) {
  const res = await request(app).post("/api/review").send({ text, ...extra }).expect(201);
  return res.body;
}

beforeAll(async () => {
  await initDb();
  await resetDb();
  app = await boot({ aiEnabled: false });
});

afterAll(async () => {
  await closeDb();
});

describe("F18 — health & reliability", () => {
  it("GET /api/health reports ok + memory backend", async () => {
    const res = await request(app).get("/api/health").expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.db).toBe("memory");
  });

  it("rejects empty/missing review text with 400", async () => {
    await request(app).post("/api/review").send({ text: "" }).expect(400);
    await request(app).post("/api/review").send({}).expect(400);
  });

  it("rejects malformed JSON with 400 and no stack trace", async () => {
    const res = await request(app)
      .post("/api/review")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js:/);
  });

  it("404s unknown content, unknown fact, unknown alert", async () => {
    await request(app).get("/api/contents/nope").expect(404);
    await request(app).put("/api/facts/nope").send({ approved: 1, actor: "admin" }).expect(404);
    await request(app).post("/api/alerts/nope/ack").send({ actor: "admin" }).expect(404);
  });
});

describe("F1/F9 — session & knowledge base", () => {
  it("issues an HMAC session token for each role", async () => {
    const res = await request(app).post("/api/session").send({ role: "reviewer", name: "Rahul" }).expect(200);
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(res.body.role).toBe("reviewer");
    await request(app).post("/api/session").send({ role: "superuser" }).expect(400);
  });

  it("token authenticates a role-gated route (admin fact edit)", async () => {
    const { token } = (await request(app).post("/api/session").send({ role: "admin" })).body;
    const res = await request(app)
      .put("/api/facts/F-SHIP")
      .set("Authorization", `Bearer ${token}`)
      .send({ approved: 599 })
      .expect(200);
    expect(res.body.fact.approved).toBe(599);
  });

  it("GET /api/kb returns rules, facts, glossary, palette, competitors, demoDate", async () => {
    const res = await request(app).get("/api/kb").expect(200);
    expect(res.body.rules).toHaveLength(14);
    expect(res.body.facts.length).toBeGreaterThanOrEqual(7); // may grow via POST /api/facts
    expect(res.body.glossary.length).toBeGreaterThan(0);
    expect(res.body.palette).toHaveLength(4);
    expect(res.body.competitors).toContain("Starbucks");
    expect(res.body.demoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.brand).toBe("Brewloom");
  });

  it("GET /api/examples returns the 3 Brewloom examples", async () => {
    const res = await request(app).get("/api/examples").expect(200);
    expect(res.body).toHaveLength(3);
  });
});

describe("F2–F7 — review pipeline (3 spec examples)", () => {
  it("Example 2 (clean welcome email) → 0 findings, Manager route", async () => {
    const r = await review(ex("example-2").text, { channel: "Email", actor: "creator" });
    expect(r.findings).toHaveLength(0);
    expect(r.route).toBe("Manager");
    expect(r.approvable).toBe(true);
    expect(r.requiredRole).toBe("manager");
  });

  it("Example 1 (Instagram caption) → ≥9 findings, Reviewer route", async () => {
    const r = await review(ex("example-1").text, { channel: "Instagram" });
    expect(r.counts.total).toBeGreaterThanOrEqual(9);
    expect(r.route).toBe("Reviewer");
    expect(r.requiredRole).toBe("reviewer");
  });

  it("findings carry stable ids (contentId.N) and citation status", async () => {
    const r = await review(ex("example-3").text, { channel: "Packaging" });
    expect(r.findings.length).toBeGreaterThan(0);
    for (const f of r.findings) {
      expect(f.id).toMatch(new RegExp(`^${r.contentId}\\.\\d+$`));
      expect(f.citationVerified).toBe(true);
    }
  });

  it("content detail exposes versions, audit trail, findings", async () => {
    const r = await review(ex("example-1").text, { channel: "Instagram" });
    const res = await request(app).get(`/api/contents/${r.contentId}`).expect(200);
    expect(res.body.versions.length).toBeGreaterThanOrEqual(1);
    expect(res.body.audit.some((a) => a.type === "reviewed")).toBe(true);
    expect(res.body.audit.some((a) => a.type === "finding")).toBe(true);
    expect(res.body.audit.length).toBeGreaterThanOrEqual(1 + r.findings.length);
    expect(res.body.comments).toEqual([]);
  });

  // F10 acceptance: "version list with diff". v1 is the baseline (no diff);
  // every later version says exactly what changed from the one before it.
  it("version list carries a diff of what each version changed", async () => {
    const r = await review(ex("example-1").text, { channel: "Instagram" });

    const first = (await request(app).get(`/api/contents/${r.contentId}`)).body;
    expect(first.versions).toHaveLength(1);
    expect(first.versions[0].diff).toBeNull(); // baseline, nothing to compare

    // Make a second version via a real edit decision.
    const fixable = r.findings.find((f) => f.verifiedSuggestion) ?? r.findings[0];
    await request(app)
      .post(`/api/findings/${fixable.id}/decision`)
      .send({ action: "edit", actor: "reviewer", replacement: "Our seasonal blend is crafted for slow mornings." })
      .expect(200);

    const after = (await request(app).get(`/api/contents/${r.contentId}`)).body;
    expect(after.versions.length).toBe(2);

    const [v1, v2] = after.versions;
    expect(v1.diff).toBeNull();
    expect(Array.isArray(v2.diff)).toBe(true);
    expect(v2.diff.length).toBeGreaterThan(1); // same + changed segments

    // The diff must be faithful: dropping "add" rebuilds v1 exactly, and
    // dropping "del" rebuilds v2 exactly.
    const rebuild = (segs, drop) => segs.filter((s) => s.type !== drop).map((s) => s.text).join("");
    expect(rebuild(v2.diff, "add")).toBe(v1.text);
    expect(rebuild(v2.diff, "del")).toBe(v2.text);

    // and it actually shows the replacement
    const changed = v2.diff.filter((s) => s.type !== "same").map((s) => s.text).join("");
    expect(changed).toContain("slow mornings");
  });

  it("F5 — fabricated AI finding (unknown ruleId) → needs-human, routes Reviewer", async () => {
    const r = await review(ex("example-2").text, {
      aiFindings: [{ ruleId: "R-HALLUCINATED", severity: "high", spanText: "Brewloom", issue: "made up" }],
    });
    expect(r.findings[0].needsHuman).toBe(true);
    expect(r.findings[0].citationVerified).toBe(false);
    expect(r.route).toBe("Reviewer");
  });

  it("F5 — paraphrased span (not a verbatim substring) → rejected", async () => {
    const r = await review(ex("example-2").text, {
      aiFindings: [{ ruleId: "R-CLAIM-1", severity: "high", spanText: "this is not in the text", issue: "x" }],
    });
    expect(r.findings[0].citationVerified).toBe(false);
    expect(r.findings[0].citationRejectReason).toMatch(/verbatim/i);
  });

  it("F4 — AI requested with no provider configured falls back cleanly", async () => {
    const r = await review(ex("example-2").text, { useAi: true });
    expect(r.ai.used).toBe(false);
    expect(r.findings).toHaveLength(0);
  });
});

describe("F15 — agent API", () => {
  it("POST /api/agent/check mirrors the citation-validated result", async () => {
    const res = await request(app).post("/api/agent/check").send({ text: ex("example-3").text }).expect(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.route).toBe("Reviewer");
    const ruleIds = [...new Set(res.body.findings.map((f) => f.ruleId))].sort();
    expect(ruleIds).toEqual(["R-CLAIM-1", "R-CLAIM-2", "R-MSG-1"]);
    expect(res.body.findings.every((f) => f.citationVerified)).toBe(true);
  });

  it("GET /api/agent/context exposes rules, facts, glossary, palette", async () => {
    const res = await request(app).get("/api/agent/context").expect(200);
    expect(res.body.rules.length).toBe(14);
    expect(res.body.facts.find((f) => f.id === "F-OFFER").approved).toBe(20);
    expect(res.body.competitors).toContain("Starbucks");
  });
});

describe("F8/F9 — finding decisions & role enforcement", () => {
  let risky; // Reviewer-routed, findings have ids

  beforeAll(async () => {
    risky = await review(ex("example-3").text, { channel: "Packaging" });
  });

  it("manager cannot approve Reviewer-routed content (403 + audited)", async () => {
    const res = await request(app)
      .post(`/api/contents/${risky.contentId}/approve`)
      .send({ actor: "manager" })
      .expect(403);
    expect(res.body.requiredRole).toBe("reviewer");
    const audit = await request(app).get(`/api/audit?contentId=${risky.contentId}`).expect(200);
    expect(audit.body.some((a) => a.type === "decision-blocked")).toBe(true);
  });

  it("reviewer can approve Reviewer-routed content (200)", async () => {
    const res = await request(app)
      .post(`/api/contents/${risky.contentId}/approve`)
      .send({ actor: "reviewer" })
      .expect(200);
    expect(res.body.content.status).toBe("approved");
    expect(res.body.content.approvedBy).toBe("reviewer");
  });

  it("unknown/empty role never passes a gate", async () => {
    // Create-fact is admin-only; an unknown role must not slip through.
    await request(app).post("/api/facts").send({ actor: "superuser", id: "X", statement: "s", owner: "o" }).expect(403);
    await request(app).post(`/api/contents/${risky.contentId}/approve`).send({ actor: "" }).expect(400);
  });

  it("accept a finding marks it and audits it", async () => {
    const fid = risky.findings[0].id;
    const res = await request(app)
      .post(`/api/findings/${fid}/decision`)
      .send({ action: "accept", actor: "reviewer" })
      .expect(200);
    const f = res.body.content.findings.find((x) => x.id === fid);
    expect(f.status).toBe("accepted");
    const audit = await request(app).get(`/api/audit?contentId=${risky.contentId}`).expect(200);
    expect(audit.body.some((a) => a.type === "finding:accept")).toBe(true);
  });

  it("dispute requires a reason", async () => {
    const fid = risky.findings[1].id;
    await request(app).post(`/api/findings/${fid}/decision`).send({ action: "dispute", actor: "reviewer" }).expect(400);
    const res = await request(app)
      .post(`/api/findings/${fid}/decision`)
      .send({ action: "dispute", actor: "reviewer", reason: "rule wording is ambiguous" })
      .expect(200);
    expect(res.body.content.findings.find((x) => x.id === fid).status).toBe("disputed");
  });

  // F8 acceptance test from the spec: "Accepting creates version 2 only after
  // a click." Accept applies the engine's verified suggestion (F7) to the live
  // text and re-runs the full checker, rather than just flipping a status flag.
  it("accept applies the verified suggestion, bumps the version and re-checks", async () => {
    const r = await review(ex("example-1").text, { channel: "Instagram" });
    const fixable = r.findings.find((f) => f.verifiedSuggestion);
    expect(fixable, "example-1 must yield at least one verified suggestion").toBeTruthy();

    const before = (await request(app).get(`/api/contents/${r.contentId}`)).body;
    expect(before.version).toBe(1);

    const res = await request(app)
      .post(`/api/findings/${fixable.id}/decision`)
      .send({ action: "accept", actor: "creator" })
      .expect(200);

    // version 2, only after the click
    expect(res.body.content.version).toBe(before.version + 1);
    // the verified fix is actually in the text now
    expect(res.body.content.text).toContain(fixable.verifiedSuggestion);
    expect(res.body.content.text).not.toContain(fixable.spanText);
    // and the engine re-ran: the finding it fixed is gone
    expect(res.body.content.findings.some((f) => f.ruleId === fixable.ruleId && f.spanText === fixable.spanText)).toBe(false);
    // a new version snapshot is stored for the version list
    const detail = (await request(app).get(`/api/contents/${r.contentId}`)).body;
    expect(detail.versions.map((v) => v.version)).toContain(2);
    expect(detail.versions.length).toBeGreaterThanOrEqual(2);
    // the text change invalidates any prior approval
    expect(["draft", "in_review", "changes_requested"]).toContain(res.body.content.status);
  });

  it("accept with no verified suggestion is status-only and does not bump the version", async () => {
    // A needs-human finding has no safe automated fix, so accept can only
    // record the decision — there is nothing to apply to the text.
    const r = await review(ex("example-3").text, { channel: "Packaging" });
    const noFix = r.findings.find((f) => !f.verifiedSuggestion);
    expect(noFix).toBeTruthy();
    const before = (await request(app).get(`/api/contents/${r.contentId}`)).body.version;

    const res = await request(app)
      .post(`/api/findings/${noFix.id}/decision`)
      .send({ action: "accept", actor: "reviewer" })
      .expect(200);

    expect(res.body.content.version).toBe(before);
    expect(res.body.content.text).toBe(r.content?.text ?? res.body.content.text);
    expect(res.body.content.findings.find((f) => f.id === noFix.id)?.status).toBe("accepted");
  });

  it("re-check after accept carries earlier decisions across", async () => {
    // Decide one finding, then accept a second: the first must survive the
    // regeneration that happens when the text changes.
    const r = await review(ex("example-1").text, { channel: "Instagram" });
    const fixable = r.findings.filter((f) => f.verifiedSuggestion);
    expect(fixable.length).toBeGreaterThanOrEqual(1);
    const plain = r.findings.find((f) => !f.verifiedSuggestion);
    expect(plain).toBeTruthy();

    await request(app)
      .post(`/api/findings/${plain.id}/decision`)
      .send({ action: "dispute", actor: "reviewer", reason: "this rule is ambiguous here" })
      .expect(200);

    const res = await request(app)
      .post(`/api/findings/${fixable[0].id}/decision`)
      .send({ action: "accept", actor: "creator" })
      .expect(200);

    expect(res.body.content.version).toBe(2);
    const kept = res.body.content.findings.find(
      (f) => f.ruleId === plain.ruleId && f.spanText === plain.spanText
    );
    expect(kept, "the disputed finding must survive the re-check").toBeTruthy();
    expect(kept.status).toBe("disputed");
    expect(kept.reason).toBe("this rule is ambiguous here");
  });

  it("a replacement containing $ patterns does not corrupt the text", async () => {
    // String.replace treats $& and $` specially; replaceSpan must not.
    const r = await review(ex("example-1").text, { channel: "Instagram" });
    const target = r.findings.find((f) => f.verifiedSuggestion) ?? r.findings[0];
    const res = await request(app)
      .post(`/api/findings/${target.id}/decision`)
      .send({ action: "edit", actor: "reviewer", replacement: "cost is $& of that" })
      .expect(200);
    expect(res.body.content.text).toContain("cost is $& of that");
    expect(res.body.content.text).not.toContain("cost is [object");
  });

  it("edit a finding replaces the span, bumps version, re-reviews", async () => {
    const r = await review(ex("example-3").text, { channel: "Packaging" });
    const fid = r.findings[0].id;
    const before = (await request(app).get(`/api/contents/${r.contentId}`)).body.version;
    const res = await request(app)
      .post(`/api/findings/${fid}/decision`)
      .send({ action: "edit", actor: "reviewer", replacement: "Brewloom blends are crafted for daily ritual." })
      .expect(200);
    expect(res.body.content.version).toBe(before + 1);
    expect(res.body.content.text).toContain("daily ritual");
    expect(res.body.content.status).toBe("draft");
  });

  it("request-changes sets status and reason", async () => {
    const r = await review(ex("example-1").text, { channel: "Instagram" });
    const res = await request(app)
      .post(`/api/contents/${r.contentId}/request-changes`)
      .send({ actor: "reviewer", reason: "tone is off-brand" })
      .expect(200);
    expect(res.body.content.status).toBe("changes_requested");
    expect(res.body.content.changesReason).toBe("tone is off-brand");
  });
});

describe("F10 — comments & audit log", () => {
  it("posts threaded comments and audits them", async () => {
    const r = await review(ex("example-2").text, { channel: "Email" });
    const c1 = await request(app)
      .post(`/api/contents/${r.contentId}/comments`)
      .send({ actor: "manager", body: "Looks good, one tweak on the CTA." })
      .expect(201);
    await request(app)
      .post(`/api/contents/${r.contentId}/comments`)
      .send({ actor: "creator", body: "Fixed.", parentId: c1.body.comment.id })
      .expect(201);

    const detail = await request(app).get(`/api/contents/${r.contentId}`).expect(200);
    expect(detail.body.comments).toHaveLength(2);
    expect(detail.body.comments[1].parentId).toBe(c1.body.comment.id);
    expect(detail.body.audit.some((a) => a.type === "comment")).toBe(true);
    await request(app).post(`/api/contents/${r.contentId}/comments`).send({ actor: "creator", body: "" }).expect(400);
  });

  it("global audit log is append-only and time-sorted", async () => {
    const res = await request(app).get("/api/audit").expect(200);
    expect(res.body.length).toBeGreaterThan(5);
    expect(res.body.some((a) => a.type === "reviewed")).toBe(true);
    for (let i = 1; i < res.body.length; i++) {
      expect(res.body[i].at >= res.body[i - 1].at).toBe(true);
    }
  });
});

describe("F12 — fact edits trigger reverse alerts", () => {
  it("20% → 25% flags seeded welcome + weekend emails, notifies Marketing", async () => {
    const res = await request(app).put("/api/facts/F-OFFER").send({ approved: 25, actor: "admin" }).expect(200);
    expect(res.body.changed).toEqual([{ factId: "F-OFFER", field: "value", from: 20, to: 25 }]);
    const itemIds = res.body.alerts.map((a) => a.itemId);
    expect(itemIds).toContain("item-welcome-email");
    expect(itemIds).toContain("item-weekend-email");
    expect(res.body.alerts[0].owner).toBe("Marketing");
    expect(res.body.byOwner[0].owner).toBe("Marketing");
  });

  it("alerts persist with content context and can be acknowledged", async () => {
    const res = await request(app).get("/api/alerts").expect(200);
    expect(res.body.alerts.length).toBeGreaterThanOrEqual(2);
    expect(res.body.byOwner.find((o) => o.owner === "Marketing").count).toBeGreaterThanOrEqual(2);
    const alert = res.body.alerts.find((a) => a.itemId === "item-welcome-email");
    expect(alert.contentText).toBeTruthy(); // context for the frontend

    const ack = await request(app).post(`/api/alerts/${alert.id}/ack`).send({ actor: "admin" }).expect(200);
    expect(ack.body.alert.ackedAt).toBeTruthy();
    const after = await request(app).get("/api/alerts").expect(200);
    expect(after.body.alerts.find((a) => a.id === alert.id).acked).toBe(true);
  });

  it("reverse alerts are audited (F10)", async () => {
    const res = await request(app).get("/api/audit").expect(200);
    expect(res.body.some((a) => a.type === "reverse-alert")).toBe(true);
  });

  it("validates fact edits (400 on bad/empty input)", async () => {
    await request(app).put("/api/facts/F-OFFER").send({ actor: "admin" }).expect(400);
    await request(app).put("/api/facts/F-OFFER").send({ actor: "admin", validUntil: "31 Dec 2026" }).expect(400);
  });

  it("admin can create a fact (201) and non-admin cannot (403)", async () => {
    await request(app)
      .post("/api/facts")
      .send({ actor: "manager", id: "F-NEW", statement: "s", owner: "o" })
      .expect(403);
    const res = await request(app)
      .post("/api/facts")
      .send({ actor: "admin", id: "F-CAFFEINE", statement: "Cold brew has 67% less acid", approved: 67, owner: "Marketing", kind: "claim" })
      .expect(201);
    expect(res.body.fact.id).toBe("F-CAFFEINE");
    await request(app)
      .post("/api/facts")
      .send({ actor: "admin", id: "F-CAFFEINE", statement: "dup", owner: "o" })
      .expect(400);
  });
});

describe("F12 — demo date move re-scans (fact expiry)", () => {
  it("moving the demo date past a validity window flips items to alerts", async () => {
    // Reset offer to 20% (approved value) with a validity that expires soon.
    await request(app).put("/api/facts/F-OFFER").send({ actor: "admin", approved: 20, validUntil: "2026-10-30" }).expect(200);
    // Move "today" to 2026-11-15 → F-OFFER is now expired.
    const res = await request(app).post("/api/settings/demo-date").send({ actor: "admin", demoDate: "2026-11-15" }).expect(200);
    expect(res.body.demoDate).toBe("2026-11-15");
    expect(res.body.alerts.length).toBeGreaterThan(0);
    expect(res.body.scanned).toBeGreaterThan(0);

    const kb = await request(app).get("/api/kb").expect(200);
    expect(kb.body.demoDate).toBe("2026-11-15");
    // non-admin cannot move it
    await request(app).post("/api/settings/demo-date").send({ actor: "manager", demoDate: "2026-01-01" }).expect(403);

    // Restore demo date + fact validity so later suites see a clean clock.
    await request(app).post("/api/settings/demo-date").send({ actor: "admin", demoDate: "2026-10-27" }).expect(200);
    await request(app).put("/api/facts/F-OFFER").send({ actor: "admin", approved: 20, validUntil: "2026-12-31" }).expect(200);
  });
});

describe("F11 — approval receipt", () => {
  it("returns sources, checks run, AI disclosure and version text", async () => {
    const r = await review(ex("example-2").text, { channel: "Email", actor: "manager" });
    await request(app).post(`/api/contents/${r.contentId}/submit`).send({ actor: "creator" }).expect(200);
    await request(app).post(`/api/contents/${r.contentId}/approve`).send({ actor: "manager" }).expect(200);

    const res = await request(app).get(`/api/contents/${r.contentId}/receipt`).expect(200);
    expect(res.body.receiptId).toBe(`RCPT-${r.contentId}`);
    expect(res.body.status).toBe("approved");
    expect(res.body.recordType).toBe("hashed, tamper-evident record");
    expect(typeof res.body.contentHash).toBe("string");
    expect(res.body.approvedBy).toBe("manager");
    expect(res.body.versionText).toBe(ex("example-2").text);
    expect(res.body.checksRun.rules).toBe(14);
    expect(res.body.ai.used).toBe(false);
    expect(res.body.dataSent).toEqual([]);
  });
});

describe("F13 — insights dashboard data", () => {
  it("returns top violated rules with clarity, by creator, accept vs dispute", async () => {
    const res = await request(app).get("/api/insights").expect(200);
    expect(res.body.topViolatedRules.length).toBeGreaterThan(0);
    expect(res.body.topViolatedRules[0].count).toBeGreaterThan(0);
    expect(res.body.byCreator.length).toBeGreaterThan(0);
    expect(res.body.decisions.total).toBeGreaterThan(0);
    expect(typeof res.body.decisions.acceptRate).toBe("number");
    expect(Array.isArray(res.body.unclearRules)).toBe(true);
    expect(res.body.totals.contents).toBeGreaterThan(0);
    expect(res.body.totals.sampleContents).toBeGreaterThan(0);
    expect(res.body.sampleData).toBe(true);

    // New strengthened panels:
    // Panel 1: top 8 most-broken rules
    expect(Array.isArray(res.body.topRules)).toBe(true);
    expect(res.body.topRules.length).toBeLessThanOrEqual(8);
    expect(res.body.topRules[0]).toHaveProperty("ruleId");
    expect(res.body.topRules[0]).toHaveProperty("title");
    expect(res.body.topRules[0]).toHaveProperty("count");

    // Panel 2: workflow status & turnaround
    expect(res.body.workflow).toBeDefined();
    expect(res.body.workflow.byStatus).toBeDefined();
    expect(typeof res.body.workflow.byStatus.draft).toBe("number");
    expect(typeof res.body.workflow.byStatus.approved).toBe("number");
    expect(res.body.workflow.inReviewWaiting).toBeDefined();
    expect(typeof res.body.workflow.inReviewWaiting.manager).toBe("number");
    expect(typeof res.body.workflow.inReviewWaiting.reviewer).toBe("number");
    expect(res.body.workflow).toHaveProperty("avgApprovalTime");

    // Panel 3: fact health sorted by soonest expiry
    expect(Array.isArray(res.body.factHealth)).toBe(true);
    expect(res.body.factHealth.length).toBeGreaterThan(0);
    expect(res.body.factHealth[0]).toHaveProperty("factId");
    expect(res.body.factHealth[0]).toHaveProperty("statement");
    expect(res.body.factHealth[0]).toHaveProperty("expiryLabel");
    expect(res.body.factHealth[0]).toHaveProperty("openAlertsCount");

    // Panel 4: AI use summary
    expect(res.body.aiSummary).toBeDefined();
    expect(typeof res.body.aiSummary.aiReviewsCount).toBe("number");
    expect(typeof res.body.aiSummary.rulesOnlyReviewsCount).toBe("number");
    expect(typeof res.body.aiSummary.downgradedFindingsCount).toBe("number");
    expect(typeof res.body.aiSummary.downgradedSharePercent).toBe("number");

    // Panel 5: Issues by category
    expect(Array.isArray(res.body.byCategory)).toBe(true);
    const catKeys = res.body.byCategory.map((c) => c.category.toLowerCase());
    expect(catKeys).toEqual(expect.arrayContaining(["tone", "terms", "claims", "facts", "accessibility", "visuals"]));
  });
});

describe("F14 — AI disclosure", () => {
  it("describes providers, redaction, stored fields and fallback", async () => {
    const res = await request(app).get("/api/ai/disclosure").expect(200);
    expect(res.body.dataSent.neverSent).toContain("audit log");
    expect(res.body.fallback).toMatch(/deterministic/);
    expect(res.body.validation).toMatch(/citation validator/i);
  });
});

describe("F2 + F16 — image upload & visual checks", () => {
  // Build a known-colour PNG in-memory so no binary fixtures are checked in.
  const pngOf = (r, g, b) => {
    const w = 4, h = 4, px = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) { px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = 0xff; }
    return encodePng({ width: w, height: h, pixels: px });
  };
  const b64 = (buf) => buf.toString("base64");

  it("off-palette image produces an R-VIS-1 finding that survives to the client", async () => {
    // hot pink #FF1493 — nowhere near the Brewloom palette
    const body = await review("New seasonal latte, delivered fast.", {
      image: b64(pngOf(0xff, 0x14, 0x93)),
      imageType: "image/png",
      altText: "Seasonal latte promotional poster",
    });
    const vis = body.findings.filter((f) => f.sourceType === "visual");
    expect(vis.length).toBeGreaterThan(0);
    expect(vis.some((f) => f.ruleId === "R-VIS-1")).toBe(true);
    // the finding cites the real rule and carries its measurement
    const paletteFinding = vis.find((f) => f.ruleId === "R-VIS-1");
    expect(paletteFinding.citationVerified).toBe(true);
    expect(paletteFinding.visual.offPalette[0].hex).toBe("#FF1493");
  });

  it("on-palette image with good alt text adds no visual findings", async () => {
    // caramel #C8963E — exactly on-palette
    const body = await review("New seasonal latte.", {
      image: b64(pngOf(0xc8, 0x96, 0x3e)),
      imageType: "image/png",
      altText: "Seasonal latte in a ceramic cup on a wooden table",
    });
    expect(body.findings.filter((f) => f.sourceType === "visual")).toHaveLength(0);
  });

  it("missing alt text on an upload is caught (R-A11Y-1)", async () => {
    const body = await review("New seasonal latte.", {
      image: b64(pngOf(0xc8, 0x96, 0x3e)),
      imageType: "image/png",
    });
    expect(body.findings.some((f) => f.ruleId === "R-A11Y-1" && f.sourceType === "visual")).toBe(true);
  });

  it("accepts a data-URL image as well as bare base64", async () => {
    const dataUrl = `data:image/png;base64,${b64(pngOf(0xff, 0x14, 0x93))}`;
    const body = await review("Latte.", { image: dataUrl, altText: "Seasonal latte poster" });
    expect(body.findings.some((f) => f.ruleId === "R-VIS-1")).toBe(true);
  });

  it("stores image facts on the content for the detail screen", async () => {
    const body = await review("Latte.", {
      image: b64(pngOf(0xff, 0x14, 0x93)),
      imageType: "image/png",
      altText: "Seasonal latte poster",
    });
    expect(body.content.image).toBeTruthy();
    expect(body.content.image.present).toBe(true);
    expect(body.content.image.width).toBe(4);
    expect(body.content.image.dominantColors[0].hex).toBe("#FF1493");
    // and they persist on GET /api/contents/:id
    const got = await request(app).get(`/api/contents/${body.contentId}`).expect(200);
    expect(got.body.image.dominantColors[0].hex).toBe("#FF1493");
  });

  it("rejects a corrupt image with 400, not a crash", async () => {
    const res = await request(app)
      .post("/api/review")
      .send({ text: "Latte.", image: Buffer.from("not-an-image-at-all").toString("base64"), imageType: "image/png" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/image/i);
  });

  it("rejects an unsupported file type with 400", async () => {
    // a GIF header — we only decode PNG and JPEG
    const gif = Buffer.from("47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b", "hex");
    const res = await request(app)
      .post("/api/review")
      .send({ text: "Latte.", image: gif.toString("base64"), imageType: "image/gif" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PNG and JPEG/);
  });

  it("visual findings are addressable for per-finding decisions", async () => {
    const body = await review("Latte.", {
      image: b64(pngOf(0xff, 0x14, 0x93)),
      imageType: "image/png",
      altText: "Seasonal latte poster",
    });
    const vis = body.findings.find((f) => f.sourceType === "visual");
    expect(vis.id).toBeTruthy();
    // a Manager can accept a low/medium visual finding like any other
    const dec = await request(app)
      .post(`/api/findings/${vis.id}/decision`)
      .send({ action: "accept", actor: "manager" });
    expect(dec.status).toBe(200);
  });
});
