/**
 * BrandGuard API server (Express).
 *
 * Full spec (Round 2 §8) API surface — every endpoint the React screens need:
 *   POST /api/session                      role switcher token (no password)
 *   GET  /api/kb (= /api/knowledge)        rules, facts, glossary, palette, demo date
 *   GET  /api/examples                     the 3 Brewloom examples
 *   POST /api/review                       intake → checks → F5 → suggestions → route
 *   GET  /api/contents, /api/contents/:id  queue + detail (versions, findings, comments, audit)
 *   POST /api/findings/:id/decision        accept | edit | dispute(reason)
 *   POST /api/contents/:id/submit|approve|request-changes   workflow, role-checked
 *   POST /api/contents/:id/comments        threaded comments (F10)
 *   GET  /api/contents/:id/receipt         approval receipt (F11)
 *   PUT/POST /api/facts                    admin edits → reverse scan (F12)
 *   POST /api/settings/demo-date           move demo date → rescan (F12)
 *   GET  /api/alerts, POST /api/alerts/:id/ack               reverse alerts (F12)
 *   GET  /api/insights                     clarity scores, by creator, accept vs dispute (F13)
 *   GET  /api/ai/disclosure                what the AI sees (F14)
 *   POST /api/agent/check, GET /api/agent/context            public AI API (F15)
 *   GET  /api/health                       liveness + db backend (F18)
 *
 * Role checks are server-side: the client-declared role (from the session
 * token or body) is validated against the route the engine assigned.
 */

import express from "express";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { review, reverseAlerts, factscan, groupAlertsByOwner, diffWords } from "../src/index.js";
import { examples } from "../src/seed.js";
import { store, nextId, now } from "./store.js";
import { collection } from "./db.js";
import { seedIfEmpty } from "./seed.js";
import { aiReview, disclosure } from "./ai.js";
import { analyseImage } from "./image.js";

/* ── Reliability middleware (F18) ─────────────────────────────────── */

const buckets = new Map(); // fixed-window rate limiter: ip → {count, resetAt}

function rateLimit({ windowMs = 60_000, max = 300 } = {}) {
  return (req, res, next) => {
    const key = req.ip ?? "anon";
    const t = Date.now();
    let b = buckets.get(key);
    if (!b || t > b.resetAt) {
      b = { count: 0, resetAt: t + windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > max) {
      res.set("Retry-After", String(Math.ceil((b.resetAt - t) / 1000)));
      return res.status(429).json({ error: "rate limit exceeded", retryAfterMs: b.resetAt - t });
    }
    next();
  };
}

const badRequest = (res, message) => res.status(400).json({ error: message });

/**
 * Replace the first occurrence of `span` in `text` with `replacement`.
 * Deliberately not String.replace: that treats `$&`, `$1`, `$`` etc. in the
 * replacement as patterns, so a user (or the engine) supplying "$&" would
 * silently corrupt the text. Index math is boring and correct.
 */
function replaceSpan(text, span, replacement) {
  const i = text.indexOf(span);
  if (i < 0) return text;
  return text.slice(0, i) + replacement + text.slice(i + span.length);
}

/**
 * Turn a client-supplied image into bytes + mime type. Accepts either a full
 * data URL ("data:image/png;base64,....") or bare base64 with the mime in
 * `imageType`. Kept small and strict: malformed base64 is a 400, not a crash.
 */
function toImageBuffer(image, imageType) {
  let b64 = String(image);
  let mimeType = imageType ?? null;
  const dataUrl = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(b64);
  if (dataUrl) {
    mimeType = mimeType ?? dataUrl[1] ?? null;
    b64 = dataUrl[3];
  }
  b64 = b64.trim();
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) throw Object.assign(new Error("invalid base64 image data"), { code: "unsupported" });
  const buffer = Buffer.from(b64, "base64");
  if (buffer.length === 0) throw Object.assign(new Error("image data is empty"), { code: "unsupported" });
  return { buffer, mimeType };
}

const MAX_TEXT = 20_000;
const ROLES = ["creator", "manager", "reviewer", "admin"];
const RANK = { creator: 0, manager: 1, reviewer: 2, admin: 3 };
const ROUTE_ROLE = { Manager: "manager", Reviewer: "reviewer" };
const ROUTE_RANK = { Manager: 1, Reviewer: 2 };

const normalizeRole = (r) => String(r ?? "").toLowerCase();
const today = () => new Date().toISOString().slice(0, 10);

/** Session token: base64 payload + HMAC — no secrets stored, no password. */
const TOKEN_SECRET = process.env.SESSION_SECRET ?? "brandguard-demo-secret";
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function verify(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expect = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  if (sig !== expect) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
}

/** Role from Authorization header first, then body.actor (demo convenience). */
function actorOf(req) {
  const header = req.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const sess = verify(header.slice(7));
    if (sess) return { role: sess.role, name: sess.name };
  }
  const role = normalizeRole(req.body?.actor);
  return { role, name: req.body?.actorName ?? role };
}

function requiredRoleFor(route) {
  return ROUTE_ROLE[route] ?? "manager";
}

/** Server-side authority check: unknown roles never rank (fixes undefined < n). */
function lacksRole(role, minRole) {
  return !(role in RANK) || RANK[role] < RANK[minRole];
}

/* ── App ──────────────────────────────────────────────────────────── */

export function createApp({ aiEnabled = true } = {}) {
  const app = express();
  app.disable("x-powered-by");
  // Body limit: generous only on /api/review (which can carry a base64 image
  // for F16); every other route stays locked at 256kb. The scoped parser runs
  // first and marks the body parsed, so the general one skips review requests.
  app.use("/api/review", express.json({ limit: "9mb" }));
  app.use(express.json({ limit: "256kb" }));
  app.use(rateLimit({ windowMs: 60_000, max: 600 }));

  const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  const demoDate = () => store.getSetting("demoDate", today());
  const kbRules = async () => (await store.listRules()).filter((r) => r.id !== "KB-CONFIG");

  /* Health (F18) */
  app.get("/api/health", route(async (_req, res) => {
    res.json({ ok: true, db: store.backend(), uptimeSec: Math.round(process.uptime()), at: now() });
  }));

  /* Session — role switcher issues a token, permissions enforced server-side */
  app.post("/api/session", (req, res) => {
    const role = normalizeRole(req.body?.role);
    if (!ROLES.includes(role)) return badRequest(res, `role must be one of ${ROLES.join(", ")}`);
    const name = String(req.body?.name ?? role).slice(0, 60);
    const session = { role, name, issuedAt: now() };
    res.json({ token: sign(session), ...session });
  });

  /* Knowledge base (F1) — what the Knowledge Base screen renders */
  app.get("/api/kb", route(async (_req, res) => {
    const config = await store.getRule("KB-CONFIG");
    res.json({
      rules: await kbRules(),
      facts: await store.listFacts(),
      glossary: config?.glossary ?? [],
      palette: config?.palette ?? [],
      competitors: config?.competitors ?? [],
      demoDate: await demoDate(),
      brand: "Brewloom",
    });
  }));
  app.get("/api/knowledge", route(async (_req, res) => {
    const config = await store.getRule("KB-CONFIG");
    res.json({ rules: await kbRules(), facts: await store.listFacts(), config: config ?? null });
  }));

  app.get("/api/examples", (_req, res) => {
    res.json(examples.map(({ id, title, channel, text, expected }) => ({ id, title, channel, text, expected })));
  });

  /* Content intake + review (F2-F7, F9, F16) */
  app.post("/api/review", route(async (req, res) => {
    const {
      text,
      channel = "Web",
      useAi = false,
      aiFindings: aiFindingsBody,
      // F2 + F16: an optional image. base64 (raw or data-URL) + authored alt text.
      image: imageBody,
      altText,
      textColor,
      bgColor,
    } = req.body ?? {};
    if (typeof text !== "string" || text.trim().length === 0) return badRequest(res, "text is required");
    if (text.length > MAX_TEXT) return badRequest(res, `text exceeds ${MAX_TEXT} characters`);

    const { role, name } = actorOf(req);
    const rules = await kbRules();
    const facts = await store.listFacts();
    const asOf = await demoDate();

    // F16: decode the image (if any) into pure facts. Decoding failures are a
    // 400, not a crash — a corrupt upload shouldn't take the review down, and
    // the caller needs to know their image wasn't checked.
    let visual = null;
    let imageMeta = null;
    if (imageBody) {
      try {
        const { buffer, mimeType } = toImageBuffer(imageBody, req.body?.imageType);
        visual = analyseImage(buffer, { mimeType, altText, textColor, bgColor });
        imageMeta = {
          present: true,
          width: visual.width,
          height: visual.height,
          dominantColors: visual.dominantColors,
          altText: typeof altText === "string" ? altText : null,
        };
      } catch (e) {
        const code = e.code === "too-large" ? 413 : e.code === "unsupported" || e.code === "corrupt" ? 400 : 400;
        return res.status(code).json({ error: `image: ${e.message}` });
      }
    }

    // AI findings: from a live provider (F4) and/or supplied directly. Either
    // way they pass through the same F5 citation validator — the gate is the
    // point, so a client cannot bypass it by supplying its own findings.
    let aiFindings = Array.isArray(aiFindingsBody) ? aiFindingsBody : [];
    let aiMeta = aiFindings.length
      ? { used: true, provider: "supplied", reason: "findings supplied by caller; validated by F5" }
      : { used: false, reason: "not requested" };
    if (useAi && aiEnabled) {
      const ai = await aiReview(text, { rules, facts });
      aiFindings = [...aiFindings, ...ai.findings];
      aiMeta = ai.meta;
    }

    const result = review(text, { rules, facts, aiFindings, asOf, visual });
    const contentId = nextId("c");
    result.findings = result.findings.map((f, i) => ({ ...f, id: `${contentId}.${i + 1}` }));

    const content = {
      id: contentId,
      title: text.slice(0, 60) + (text.length > 60 ? "…" : ""),
      channel,
      text,
      // F16: keep the image facts on the content so the detail screen can
      // re-render them and the receipt can cite what was measured.
      image: imageMeta,
      status: "draft",
      createdBy: name || role || "creator",
      creatorRole: role || "creator",
      version: 1,
      sampleData: false,
      route: result.route,
      requiredRole: requiredRoleFor(result.route),
      approvable: result.approvable,
      counts: result.counts,
      findings: result.findings,
      ai: aiMeta,
      demoDate: asOf,
      createdAt: now(),
      updatedAt: now(),
    };
    await store.saveContent(content);
    await store.appendAudit({
      id: nextId("audit"),
      contentId,
      type: "reviewed",
      actor: name || role || "creator",
      role: role || "creator",
      at: now(),
      detail: `${result.counts.total} finding(s); routed to ${result.route}`,
    });
    for (const f of result.findings) {
      await store.appendAudit({
        id: nextId("audit"),
        contentId,
        type: "finding",
        actor: "engine",
        role: "system",
        at: now(),
        detail: `${f.severity} ${f.ruleId}${f.factId ? `→${f.factId}` : ""} on "${f.spanText}": ${f.issue}`,
        findingId: f.id,
      });
    }

    res.status(201).json({
      contentId,
      ...result,
      requiredRole: requiredRoleFor(result.route),
      content,
      ai: aiMeta,
      demoDate: asOf,
    });
  }));

  /* Queue (spec §12): every content with status, risk, who must act */
  app.get("/api/contents", route(async (req, res) => {
    const contents = await store.listContents();
    res.json(
      contents.map((c) => ({
        id: c.id,
        title: c.title,
        channel: c.channel,
        status: c.status,
        version: c.version,
        route: c.route,
        requiredRole: c.requiredRole ?? requiredRoleFor(c.route),
        risk: c.counts?.high > 0 || (c.findings ?? []).some((f) => f.needsHuman) ? "high"
          : (c.counts?.total ?? 0) > 0 ? "medium"
          : "none",
        createdBy: c.createdBy,
        creatorRole: c.creatorRole,
        counts: c.counts,
        findingCount: (c.findings ?? []).length,
        sampleData: c.sampleData ?? false,
        ai: c.ai ?? null,
        lastDecision: c.lastDecision ?? null,
        scheduledFor: c.scheduledFor ?? null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }))
    );
  }));

  app.get("/api/contents/:id", route(async (req, res) => {
    const content = await store.getContent(req.params.id);
    if (!content) return res.status(404).json({ error: "not found" });
    const versions = await store.listVersions(content.id);
    const audit = await store.listAudit({ contentId: content.id });
    const comments = await store.listComments(content.id);
    // F10: each version carries its diff against the one before it, so the
    // detail screen can show exactly what a decision changed. v1 is the
    // baseline and has nothing to diff against.
    const withDiff = versions.map((v, i) => ({
      version: v.version,
      text: v.text,
      createdBy: v.createdBy ?? v.lastDecision?.actor ?? "engine",
      createdAt: v.createdAt ?? null,
      updatedAt: v.updatedAt ?? null,
      status: v.status ?? null,
      lastDecision: v.lastDecision ?? null,
      diff: i === 0 ? null : diffWords(versions[i - 1].text ?? "", v.text ?? ""),
    }));
    res.json({
      ...content,
      requiredRole: content.requiredRole ?? requiredRoleFor(content.route),
      versions: withDiff,
      audit,
      comments,
    });
  }));

  /* Findings decision (F8): accept | edit | dispute, per finding */
  app.post("/api/findings/:id/decision", route(async (req, res) => {
    const findingId = req.params.id;
    const dot = findingId.lastIndexOf(".");
    if (dot < 1) return badRequest(res, "malformed finding id");
    const contentId = findingId.slice(0, dot);

    const { action, replacement, reason } = req.body ?? {};
    const { role, name } = actorOf(req);
    if (!ROLES.includes(role)) return badRequest(res, `actor must be one of ${ROLES.join(", ")}`);
    if (!["accept", "edit", "dispute"].includes(action)) {
      return badRequest(res, "action must be accept|edit|dispute");
    }
    if (action === "dispute" && (!reason || typeof reason !== "string")) {
      return badRequest(res, "dispute requires a reason");
    }
    if (action === "edit" && (typeof replacement !== "string" || replacement.trim() === "")) {
      return badRequest(res, "edit requires replacement text");
    }

    const content = await store.getContent(contentId);
    if (!content) return res.status(404).json({ error: "content not found" });
    const finding = (content.findings ?? []).find((f) => f.id === findingId);
    if (!finding) return res.status(404).json({ error: "finding not found" });

    const nextFindings = content.findings.map((f) =>
      f.id === findingId
        ? { ...f, status: action === "accept" ? "accepted" : action === "edit" ? "edited" : "disputed", reason: reason ?? null }
        : f
    );

    let updated = {
      ...content,
      findings: nextFindings,
      updatedAt: now(),
      lastDecision: { action, actor: name || role, findingId, reason: reason ?? null, at: now() },
    };

    // F8: accept and edit both change the live text and therefore create a new
    // version that is re-checked by the full engine.
    //   edit   → applies the reviewer's own replacement text
    //   accept → applies the engine's verified suggestion (F7) — the fix that
    //            already re-checked clean, so accepting it is safe by construction
    // If accept has no verified suggestion there is nothing to apply, so we fall
    // through to a status-only accept rather than inventing an edit.
    const applicable = action === "edit" ? replacement : finding.verifiedSuggestion;
    if ((action === "edit" || action === "accept") && applicable) {
      const replaced = replaceSpan(content.text, finding.spanText, applicable);
      const rules = await kbRules();
      const facts = await store.listFacts();
      const result = review(replaced, { rules, facts, asOf: await demoDate() });
      const version = content.version + 1;

      // The re-check regenerates findings with fresh ids, so carry human
      // decisions across by identity (rule + exact span). A finding the fix
      // removed simply doesn't come back — which is the whole point of F7.
      const prior = new Map(nextFindings.map((f) => [`${f.ruleId}::${f.spanText}`, f]));
      const findings = result.findings.map((f, i) => {
        const keep = prior.get(`${f.ruleId}::${f.spanText}`);
        return {
          ...f,
          id: `${content.id}.${i + 1}`,
          status: keep?.status ?? "open",
          reason: keep?.reason ?? null,
        };
      });

      updated = {
        ...updated,
        text: replaced,
        version,
        route: result.route,
        requiredRole: requiredRoleFor(result.route),
        approvable: result.approvable,
        counts: result.counts,
        findings,
        // The text changed, so any prior approval no longer covers it.
        status: content.status === "approved" ? "draft" : content.status,
      };
    }

    // "All resolved" = every finding carries a decided status. Computed from
    // the final list either way: regenerated (edit/accept-with-fix) or the
    // status-only accept/dispute.
    updated.allFindingsResolved = (updated.findings ?? []).every(
      (f) => f.status === "accepted" || f.status === "edited"
    );

    await store.saveContent(updated);
    await store.appendAudit({
      id: nextId("audit"),
      contentId: content.id,
      type: `finding:${action}`,
      actor: name || role,
      role,
      at: now(),
      findingId,
      detail:
        action === "dispute"
          ? `disputed ${finding.ruleId} on "${finding.spanText}": ${reason}`
          : applicable
            ? `"${finding.spanText}" → "${applicable}"; version ${updated.version} re-reviewed`
            : `accepted ${finding.ruleId} finding on "${finding.spanText}" (no verified fix to apply)`,
    });

    res.json({ ok: true, content: updated });
  }));

  /* Workflow (F9): submit | approve | request-changes — server enforces role */
  const workflow = (action, handler) =>
    app.post(`/api/contents/:id/${action}`, route(async (req, res) => {
      const { role, name } = actorOf(req);
      if (!ROLES.includes(role)) return badRequest(res, `actor must be one of ${ROLES.join(", ")}`);
      const content = await store.getContent(req.params.id);
      if (!content) return res.status(404).json({ error: "not found" });

      const requiredRole = content.requiredRole ?? requiredRoleFor(content.route);
      if (action !== "submit" && lacksRole(role, requiredRole)) {
        await store.appendAudit({
          id: nextId("audit"),
          contentId: content.id,
          type: "decision-blocked",
          actor: name || role,
          role,
          at: now(),
          detail: `${role} tried to ${action} content routed to ${content.route} (needs ${requiredRole})`,
        });
        return res.status(403).json({ error: `role '${role}' cannot ${action} this content`, requiredRole, route: content.route });
      }

      const { updated, detail, auditType } = await handler(content, { role, name }, req.body ?? {});
      await store.saveContent(updated);
      await store.appendAudit({
        id: nextId("audit"),
        contentId: content.id,
        type: auditType,
        actor: name || role,
        role,
        at: now(),
        detail,
      });
      res.json({ ok: true, content: updated });
    }));

  workflow("submit", async (content, { name, role }) => ({
    updated: {
      ...content,
      status: "in_review",
      updatedAt: now(),
      submittedBy: name || role,
      submittedAt: content.submittedAt ?? now(),
    },
    detail: `submitted v${content.version} for ${content.route} review`,
    auditType: "workflow:submit",
  }));

  workflow("approve", async (content, { name, role }) => ({
    updated: {
      ...content,
      status: "approved",
      approvedBy: name || role,
      approvedAt: content.approvedAt ?? now(),
      updatedAt: now(),
    },
    detail: `approved v${content.version} (route ${content.route}, ${content.counts?.total ?? 0} finding(s))`,
    auditType: "workflow:approve",
  }));

  workflow("request-changes", async (content, { name, role }, body) => ({
    updated: {
      ...content,
      status: "changes_requested",
      updatedAt: now(),
      changesReason: String(body?.reason ?? "").slice(0, 500) || null,
    },
    detail: `requested changes on v${content.version}${body?.reason ? `: ${body.reason}` : ""}`,
    auditType: "workflow:request-changes",
  }));

  /* Comments (F10) */
  app.post("/api/contents/:id/comments", route(async (req, res) => {
    const { role, name } = actorOf(req);
    if (!ROLES.includes(role)) return badRequest(res, `actor must be one of ${ROLES.join(", ")}`);
    const body = String(req.body?.body ?? "").trim();
    if (!body) return badRequest(res, "comment body is required");
    const content = await store.getContent(req.params.id);
    if (!content) return res.status(404).json({ error: "not found" });

    const comment = {
      id: nextId("comment"),
      contentId: content.id,
      parentId: typeof req.body?.parentId === "string" ? req.body.parentId : null,
      author: name || role,
      role,
      body: body.slice(0, 2000),
      createdAt: now(),
    };
    await store.addComment(comment);
    await store.appendAudit({
      id: nextId("audit"),
      contentId: content.id,
      type: "comment",
      actor: comment.author,
      role,
      at: now(),
      detail: `commented: ${comment.body.slice(0, 80)}`,
    });
    res.status(201).json({ ok: true, comment });
  }));

  /* Approval receipt (F11) */
  app.get("/api/contents/:id/receipt", route(async (req, res) => {
    const content = await store.getContent(req.params.id);
    if (!content) return res.status(404).json({ error: "not found" });
    const rules = await kbRules();
    const facts = await store.listFacts();
    const cited = new Set();
    for (const f of content.findings ?? []) if (f.citationVerified) cited.add(f.factId ?? f.ruleId);

    const contentHash = crypto.createHash("sha256").update(content.text ?? "").digest("hex");

    res.json({
      receiptId: `RCPT-${content.id}`,
      recordType: "hashed, tamper-evident record",
      contentHash: `sha256:${contentHash}`,
      generatedAt: now(),
      content: { id: content.id, title: content.title, channel: content.channel, version: content.version },
      status: content.status,
      approvedBy: content.approvedBy ?? null,
      approvedAt: content.approvedAt ?? null,
      routedTo: content.route,
      versionText: content.text,
      // F16: what was measured off the image, so the receipt is complete.
      image: content.image ?? null,
      sources: [...cited].map((id) => {
        const rec = rules.find((r) => r.id === id) ?? facts.find((f) => f.id === id);
        return rec
          ? { id, kind: facts.some((f) => f.id === id) ? "fact" : "rule", text: rec.text ?? rec.statement, validUntil: rec.validUntil ?? null }
          : { id, kind: "unknown", text: null };
      }),
      checksRun: { rules: rules.length, facts: facts.length },
      ai: content.ai ?? { used: false, provider: null },
      dataSent: content.ai?.used ? content.ai.fieldsSent ?? ["content text"] : [],
      findingsSummary: content.counts ?? { total: 0 },
      demoDate: content.demoDate ?? null,
      sampleData: content.sampleData ?? false,
    });
  }));

  /* Facts (F1): admin edit/create, both trigger the reverse scan.
   * Persistence is shared: raw engine alerts → ids → per-item replace → audit. */
  const persistAlerts = async (alerts, actorName) => {
    const withIds = alerts.map((a) => ({ id: nextId("alert"), ...a, statusNew: true, createdAt: now(), ackedAt: null }));
    const byItem = new Map();
    for (const a of withIds) {
      if (!byItem.has(a.itemId)) byItem.set(a.itemId, []);
      byItem.get(a.itemId).push(a);
    }
    for (const [itemId, list] of byItem) await store.replaceAlertsFor(itemId, list);
    for (const a of withIds) {
      await store.appendAudit({
        id: nextId("audit"),
        contentId: a.itemId,
        type: "reverse-alert",
        actor: actorName ?? "admin",
        role: "admin",
        at: now(),
        detail: `${a.factId}: ${a.issue} → notify ${a.owner}`,
      });
    }
    return withIds;
  };

  const runReverseScan = async (before, after, actorName) => {
    const contents = [
      ...(await store.listContents({ status: "approved" })),
      ...(await store.listContents({ status: "scheduled" })),
    ];
    const { changed, alerts } = reverseAlerts(contents, before, after, await demoDate());
    const withIds = await persistAlerts(alerts, actorName);
    return { changed, alerts: withIds };
  };

  app.put("/api/facts/:id", route(async (req, res) => {
    const fact = await store.getFact(req.params.id);
    if (!fact) return res.status(404).json({ error: "fact not found" });
    const { role, name } = actorOf(req);
    if (lacksRole(role, "admin")) {
      return res.status(403).json({ error: "only admin may edit facts", requiredRole: "admin" });
    }
    const { approved, validUntil, statement } = req.body ?? {};
    if (approved === undefined && validUntil === undefined && statement === undefined) {
      return badRequest(res, "provide at least one of approved, validUntil, statement");
    }
    if (validUntil !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(validUntil))) {
      return badRequest(res, "validUntil must be YYYY-MM-DD");
    }

    const before = await store.listFacts();
    const after = before.map((f) =>
      f.id === fact.id
        ? {
            ...f,
            ...(approved !== undefined ? { approved } : {}),
            ...(validUntil !== undefined ? { validUntil } : {}),
            ...(statement !== undefined ? { statement } : {}),
            updatedAt: now(),
          }
        : f
    );
    await store.upsertFact(after.find((f) => f.id === fact.id));

    const { changed, alerts } = await runReverseScan(before, after, name || role);
    res.json({ ok: true, fact: after.find((f) => f.id === fact.id), changed, alerts, byOwner: groupAlertsByOwner(alerts) });
  }));

  app.post("/api/facts", route(async (req, res) => {
    const { role, name } = actorOf(req);
    if (lacksRole(role, "admin")) return res.status(403).json({ error: "only admin may create facts", requiredRole: "admin" });
    const { id, statement, approved, validUntil, owner, kind = "fact", detect } = req.body ?? {};
    if (!id || !statement || !owner) return badRequest(res, "id, statement and owner are required");
    if ((await store.getRule(id)) || (await store.getFact(id))) return badRequest(res, `id '${id}' already exists`);
    if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(String(validUntil))) return badRequest(res, "validUntil must be YYYY-MM-DD");

    const fact = {
      id: String(id),
      kind: kind === "claim" ? "claim" : "fact",
      statement: String(statement),
      approved: approved ?? null,
      validUntil: validUntil ?? null,
      owner: String(owner),
      detect: detect ?? null,
      createdAt: now(),
    };
    await store.upsertFact(fact);
    await store.appendAudit({
      id: nextId("audit"),
      type: "fact:created",
      actor: name || role,
      role,
      at: now(),
      detail: `created ${fact.id}: ${fact.statement}`,
    });
    res.status(201).json({ ok: true, fact });
  }));

  /* Demo date (F12): moving it re-scans every approved/scheduled item */
  app.post("/api/settings/demo-date", route(async (req, res) => {
    const { role, name } = actorOf(req);
    if (lacksRole(role, "admin")) return res.status(403).json({ error: "only admin may move the demo date", requiredRole: "admin" });
    const demoDate = String(req.body?.demoDate ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(demoDate)) return badRequest(res, "demoDate must be YYYY-MM-DD");

    const before = await store.listFacts();
    await store.setSetting("demoDate", demoDate);
    const contents = [
      ...(await store.listContents({ status: "approved" })),
      ...(await store.listContents({ status: "scheduled" })),
    ];
    // A date move changes no fact — it changes what "expired as of today"
    // means. reverseAlerts() filters to changed facts only, so it would find
    // nothing; factscan() scans as of the NEW date, which is exactly the
    // expiry half of F12.
    const raw = factscan(contents, before, demoDate);
    const withIds = await persistAlerts(raw, name || role);
    await store.appendAudit({
      id: nextId("audit"),
      type: "settings:demo-date",
      actor: name || role,
      role,
      at: now(),
      detail: `demo date moved to ${demoDate}; ${withIds.length} reverse alert(s) across ${contents.length} item(s)`,
    });
    res.json({ ok: true, demoDate, alerts: withIds, byOwner: groupAlertsByOwner(withIds), scanned: contents.length });
  }));

  app.get("/api/settings", route(async (_req, res) => {
    res.json({ demoDate: await demoDate() });
  }));

  /* Alerts (F12) */
  app.get("/api/alerts", route(async (_req, res) => {
    const alerts = await store.listAlerts();
    const contents = await store.listContents();
    const withContext = alerts.map((a) => {
      const c = contents.find((x) => x.id === a.itemId);
      return {
        ...a,
        contentTitle: c?.title ?? a.title,
        contentText: c?.text ?? null,
        contentStatus: c?.status ?? null,
        acked: Boolean(a.ackedAt),
      };
    });
    res.json({ alerts: withContext, byOwner: groupAlertsByOwner(withContext) });
  }));

  app.post("/api/alerts/:id/ack", route(async (req, res) => {
    const { role, name } = actorOf(req);
    if (!ROLES.includes(role)) return badRequest(res, `actor must be one of ${ROLES.join(", ")}`);
    const alerts = await store.listAlerts();
    const alert = alerts.find((a) => a.id === req.params.id);
    if (!alert) return res.status(404).json({ error: "alert not found" });
    const acked = { ...alert, ackedAt: now(), ackedBy: name || role };
    await collection("alerts").replaceOne({ id: acked.id }, acked);
    await store.appendAudit({
      id: nextId("audit"),
      contentId: alert.itemId,
      type: "alert:ack",
      actor: name || role,
      role,
      at: now(),
      detail: `acknowledged ${alert.factId} alert on "${alert.spanText}"`,
    });
    res.json({ ok: true, alert: acked });
  }));

  /* Audit log (F10) */
  app.get("/api/audit", route(async (req, res) => {
    const filter = req.query.contentId ? { contentId: String(req.query.contentId) } : {};
    res.json(await store.listAudit(filter));
  }));

  /* Insights (F13): top rules, by creator, accept vs dispute, clarity scores */
  app.get("/api/insights", route(async (_req, res) => {
    const contents = (await store.listContents()) ?? [];
    const rules = await kbRules();
    const facts = (await store.listFacts()) ?? [];
    const alerts = (await store.listAlerts()) ?? [];
    const currentDemoDate = await demoDate();

    const byRule = new Map();       // ruleId → {count, accepted, disputed, edited}
    const byCreator = new Map();    // creator → {reviews, findings, high}
    let accepted = 0;
    let disputed = 0;
    let edited = 0;

    // Workflow status metrics (Panel 2)
    const byStatus = {
      draft: 0,
      in_review: 0,
      changes_requested: 0,
      approved: 0,
      scheduled: 0,
    };
    let waitingManager = 0;
    let waitingReviewer = 0;
    const approvalDurations = [];

    // AI use summary metrics (Panel 4)
    let aiReviewsCount = 0;
    let rulesOnlyReviewsCount = 0;
    let latestAiReview = null;
    let downgradedFindingsCount = 0;
    let totalFindingsCount = 0;

    // Issues by category (Panel 5)
    const categoryCounts = {
      Tone: 0,
      Terms: 0,
      Claims: 0,
      Facts: 0,
      Accessibility: 0,
      Visuals: 0,
    };

    for (const c of contents) {
      const creator = c.createdBy ?? "unknown";
      if (!byCreator.has(creator)) byCreator.set(creator, { creator, contents: 0, findings: 0, high: 0, sampleData: c.sampleData ?? false });
      const bc = byCreator.get(creator);
      bc.contents += 1;

      // Status aggregation
      const s = c.status ?? "draft";
      if (byStatus[s] !== undefined) byStatus[s] += 1;

      if (s === "in_review") {
        const reqRole = (c.requiredRole ?? (c.route === "Reviewer" ? "reviewer" : "manager")).toLowerCase();
        if (reqRole === "reviewer") waitingReviewer += 1;
        else waitingManager += 1;
      }

      // Check approval duration
      if ((s === "approved" || s === "scheduled") && c.approvedAt) {
        let submitTime = c.submittedAt ? new Date(c.submittedAt).getTime() : null;
        if (!submitTime && c.createdAt) submitTime = new Date(c.createdAt).getTime();
        const approveTime = new Date(c.approvedAt).getTime();
        if (submitTime && approveTime && approveTime >= submitTime) {
          approvalDurations.push(approveTime - submitTime);
        }
      }

      // AI review tracking
      if (c.ai?.used) {
        aiReviewsCount += 1;
        if (!latestAiReview || (c.updatedAt ?? c.createdAt ?? "") > (latestAiReview.updatedAt ?? latestAiReview.createdAt ?? "")) {
          latestAiReview = c;
        }
      } else {
        rulesOnlyReviewsCount += 1;
      }

      for (const f of c.findings ?? []) {
        totalFindingsCount += 1;
        if (f.needsHuman || f.severity === "needs-human" || f.citationVerified === false) {
          downgradedFindingsCount += 1;
        }

        const key = f.factId ?? f.ruleId;
        if (!byRule.has(key)) byRule.set(key, { ruleId: key, count: 0, accepted: 0, disputed: 0, edited: 0, needsHuman: 0 });
        const br = byRule.get(key);
        br.count += 1;
        bc.findings += 1;
        if (f.severity === "high" || f.needsHuman) { br.needsHuman += 1; bc.high += 1; }
        if (f.status === "accepted") { br.accepted += 1; accepted += 1; }
        if (f.status === "disputed") { br.disputed += 1; disputed += 1; }
        if (f.status === "edited") { br.edited += 1; edited += 1; }

        // Categorization for Panel 5
        let cat = null;
        if (f.factId || key === "R-FACT-1" || key.startsWith("F-") || key.startsWith("C-")) {
          cat = "Facts";
        } else if (key.startsWith("R-TONE-")) {
          cat = "Tone";
        } else if (key.startsWith("R-TERM-")) {
          cat = "Terms";
        } else if (key.startsWith("R-CLAIM-") || key.startsWith("R-MSG-")) {
          cat = "Claims";
        } else if (key.startsWith("R-A11Y-")) {
          cat = "Accessibility";
        } else if (key.startsWith("R-VIS-") || f.sourceType === "visual") {
          cat = "Visuals";
        } else {
          const r = rules.find((x) => x.id === key);
          if (r?.category && categoryCounts[r.category] !== undefined) {
            cat = r.category;
          }
        }
        if (cat && categoryCounts[cat] !== undefined) categoryCounts[cat] += 1;
        else categoryCounts.Claims += 1;
      }
    }

    // Clarity score (spec: dispute-heavy rules are likely ambiguous): 0-100, higher = clearer.
    const topViolatedRules = [...byRule.values()]
      .map((r) => {
        const decided = r.accepted + r.disputed + r.edited;
        const clarity = decided === 0 ? null : Math.round(100 * (1 - r.disputed / decided));
        return { ...r, clarity };
      })
      .sort((a, b) => b.count - a.count);

    const unclearRules = topViolatedRules
      .filter((r) => r.disputed > 0)
      .sort((a, b) => (a.clarity ?? 101) - (b.clarity ?? 101));

    // Panel 1: Top 8 broken rules with title and category
    const topRules = topViolatedRules.slice(0, 8).map((r) => {
      const rec = rules.find((x) => x.id === r.ruleId) ?? facts.find((x) => x.id === r.ruleId);
      const title = rec?.text ?? rec?.statement ?? r.ruleId;
      const category = rec?.category ?? (facts.some((x) => x.id === r.ruleId) ? "Facts" : "Other");
      const severity = rec?.severity ?? "medium";
      return {
        ruleId: r.ruleId,
        title,
        count: r.count,
        clarity: r.clarity,
        severity,
        category,
      };
    });

    // Panel 2: Average approval time formatting
    let avgApprovalTimeFormatted = "not enough data";
    let avgApprovalTimeMs = null;
    if (approvalDurations.length >= 2) {
      const sum = approvalDurations.reduce((a, b) => a + b, 0);
      avgApprovalTimeMs = Math.round(sum / approvalDurations.length);
      if (avgApprovalTimeMs < 60000) {
        avgApprovalTimeFormatted = `${Math.round(avgApprovalTimeMs / 1000)}s`;
      } else if (avgApprovalTimeMs < 3600000) {
        const mins = Math.floor(avgApprovalTimeMs / 60000);
        const secs = Math.round((avgApprovalTimeMs % 60000) / 1000);
        avgApprovalTimeFormatted = secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
      } else {
        const hours = (avgApprovalTimeMs / 3600000).toFixed(1);
        avgApprovalTimeFormatted = `${hours}h`;
      }
    }

    const workflowStats = {
      byStatus,
      inReviewWaiting: {
        manager: waitingManager,
        reviewer: waitingReviewer,
      },
      avgApprovalTime: avgApprovalTimeFormatted,
      avgApprovalTimeMs,
      approvalsCount: approvalDurations.length,
    };

    // Panel 3: Fact health sorted by soonest expiry computed against current demoDate
    const factHealth = facts.map((f) => {
      let daysUntilExpiry = null;
      let expiryStatus = "active";
      let expiryLabel = "No expiry";

      if (f.validUntil) {
        const validDate = new Date(`${f.validUntil}T00:00:00Z`).getTime();
        const currDate = new Date(`${currentDemoDate}T00:00:00Z`).getTime();
        const diffDays = Math.round((validDate - currDate) / (1000 * 60 * 60 * 24));
        daysUntilExpiry = diffDays;
        if (diffDays < 0) {
          expiryStatus = "expired";
          expiryLabel = "Expired";
        } else if (diffDays === 0) {
          expiryStatus = "today";
          expiryLabel = "Expires today";
        } else {
          expiryStatus = "active";
          expiryLabel = `Expires in ${diffDays} day${diffDays === 1 ? "" : "s"}`;
        }
      }

      const openAlertsCount = alerts.filter((a) => a.factId === f.id && !a.ackedAt).length;

      return {
        factId: f.id,
        statement: f.statement,
        owner: f.owner ?? "unassigned",
        kind: f.kind ?? "fact",
        validUntil: f.validUntil ?? null,
        daysUntilExpiry,
        expiryStatus,
        expiryLabel,
        openAlertsCount,
      };
    }).sort((a, b) => {
      if (a.daysUntilExpiry === null) return 1;
      if (b.daysUntilExpiry === null) return -1;
      return a.daysUntilExpiry - b.daysUntilExpiry;
    });

    // Panel 4: AI use summary
    const aiSummary = {
      aiReviewsCount,
      rulesOnlyReviewsCount,
      totalReviews: contents.length,
      hasAiReviews: aiReviewsCount > 0,
      recentProvider: latestAiReview?.ai?.provider ?? null,
      recentModel: latestAiReview?.ai?.model ?? null,
      recentAt: latestAiReview?.updatedAt ?? latestAiReview?.createdAt ?? null,
      downgradedFindingsCount,
      totalFindingsCount,
      downgradedSharePercent: totalFindingsCount === 0 ? 0 : Math.round((100 * downgradedFindingsCount) / totalFindingsCount),
    };

    // Panel 5: Issues by category
    const totalCategoryFindings = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
    const byCategory = Object.entries(categoryCounts).map(([category, count]) => ({
      category,
      count,
      sharePercent: totalCategoryFindings === 0 ? 0 : Math.round((100 * count) / totalCategoryFindings),
    })).sort((a, b) => b.count - a.count);

    res.json({
      topViolatedRules,
      topRules,
      workflow: workflowStats,
      factHealth,
      aiSummary,
      byCategory,
      byCreator: [...byCreator.values()].sort((a, b) => b.findings - a.findings),
      decisions: {
        accepted,
        disputed,
        edited,
        total: accepted + disputed + edited,
        acceptRate: accepted + disputed + edited === 0 ? null : Math.round((100 * accepted) / (accepted + disputed + edited)),
      },
      unclearRules,
      totals: {
        contents: contents.length,
        sampleContents: contents.filter((c) => c.sampleData).length,
        liveContents: contents.filter((c) => !c.sampleData).length,
      },
      sampleData: contents.some((c) => c.sampleData),
      demoDate: currentDemoDate,
    });
  }));

  /* F17 — one rule's findings across all content. This is what a node in the
   * rule constellation opens: every place that rule was broken, with the span,
   * the human issue text, and a link to the content it came from. */
  app.get("/api/insights/rules/:id", route(async (req, res) => {
    const ruleId = req.params.id;
    const contents = await store.listContents();
    const occurrences = [];

    for (const c of contents) {
      const full = await store.getContent(c.id);
      for (const f of full?.findings ?? []) {
        const key = f.sourceId ?? f.factId ?? f.ruleId;
        if (key !== ruleId) continue;
        occurrences.push({
          contentId: c.id,
          title: c.title,
          channel: c.channel,
          status: c.status,
          findingId: f.id,
          spanText: f.spanText,
          spanStart: f.spanStart,
          severity: f.severity,
          needsHuman: f.needsHuman ?? false,
          issue: f.issue,
          suggestion: f.verifiedSuggestion ?? f.suggestion ?? null,
          citationVerified: f.citationVerified ?? false,
          decision: f.status ?? "open",
          sampleData: c.sampleData ?? false,
        });
      }
    }

    // Clarity, mirroring the insights aggregate so the panel agrees with the
    // constellation colour.
    const decided = occurrences.filter((o) => ["accepted", "edited", "disputed"].includes(o.decision));
    const disputed = decided.filter((o) => o.decision === "disputed").length;
    const clarity = decided.length === 0 ? null : Math.round(100 * (1 - disputed / decided.length));

    // Pull the rule/fact wording from the knowledge base for the panel header.
    const rules = await kbRules();
    const facts = await store.listFacts();
    const def = rules.find((r) => r.id === ruleId) ?? facts.find((f) => f.id === ruleId) ?? null;

    res.json({
      ruleId,
      definition: def
        ? { id: def.id, text: def.text ?? def.statement ?? "", severity: def.severity ?? null }
        : null,
      clarity,
      counts: {
        total: occurrences.length,
        decided: decided.length,
        disputed,
        open: occurrences.filter((o) => o.decision === "open").length,
      },
      occurrences,
      demoDate: await demoDate(),
    });
  }));

  /* AI disclosure (F14) + Agent API (F15) */
  app.get("/api/ai/disclosure", (_req, res) => res.json(disclosure(aiEnabled)));

  app.post("/api/agent/check", route(async (req, res) => {
    const { text, channel = "Agent" } = req.body ?? {};
    if (typeof text !== "string" || text.trim().length === 0) return badRequest(res, "text is required");
    if (text.length > MAX_TEXT) return badRequest(res, `text exceeds ${MAX_TEXT} characters`);
    const result = review(text, { rules: await kbRules(), facts: await store.listFacts(), channel, asOf: await demoDate() });
    res.json({
      ok: result.approvable,
      route: result.route,
      counts: result.counts,
      findings: result.findings.map((f) => ({
        ruleId: f.ruleId,
        factId: f.factId ?? null,
        severity: f.severity,
        spanText: f.spanText,
        issue: f.issue,
        sourceQuote: f.sourceQuote,
        citationVerified: f.citationVerified,
      })),
    });
  }));

  app.get("/api/agent/context", route(async (_req, res) => {
    const config = await store.getRule("KB-CONFIG");
    res.json({
      brand: "Brewloom",
      demoDate: await demoDate(),
      rules: (await kbRules()).map((r) => ({ id: r.id, category: r.category, severity: r.severity, text: r.text })),
      facts: (await store.listFacts()).map((f) => ({
        id: f.id, kind: f.kind, statement: f.statement, approved: f.approved, validUntil: f.validUntil, owner: f.owner,
      })),
      glossary: config?.glossary ?? [],
      palette: config?.palette ?? [],
      competitors: config?.competitors ?? [],
      endpoint: "POST /api/agent/check {text} → {ok, route, findings[]}",
    });
  }));

  /* Serve the built React client (one URL for the whole app, per spec §8).
   * In dev, Vite proxies /api here instead; this branch only matters when
   * `npm run build` has produced ../public. */
  const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
  if (existsSync(join(publicDir, "index.html"))) {
    app.use(express.static(publicDir, { index: "index.html", maxAge: "1h" }));
    // SPA fallback: any non-API GET returns the app shell.
    app.get(/^\/(?!api\/).*/, (req, res, next) => {
      if (req.method !== "GET") return next();
      res.sendFile(join(publicDir, "index.html"));
    });
  }

  /* Error handler (F18): never leak stack traces. */
  app.use((err, _req, res, _next) => {
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "payload too large" });
    if (err instanceof SyntaxError && "body" in err) return res.status(400).json({ error: "invalid JSON" });
    console.error("[brandguard]", err);
    res.status(500).json({ error: "internal error" });
  });

  return app;
}

/** Boot helper: seed knowledge base, return app (used by index.js and tests). */
export async function boot(opts) {
  const app = createApp(opts);
  await seedIfEmpty();
  return app;
}
