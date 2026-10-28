/**
 * Content detail screen.
 *
 * Everything the backend knows about one content item, on one page:
 * the text, every finding with its per-finding decision controls (F8),
 * the version history, threaded comments, the audit trail (F10), and the
 * approval receipt (F11). Workflow actions enforce roles server-side (F9).
 */

import React, { useCallback, useEffect, useState } from "react";
import { api, getSession } from "../api.js";
import {
  AIBadge,
  Card,
  Empty,
  Loading,
  PageIntro,
  riskPill,
  severityPill,
  sourceChip,
  statusPill,
  timeAgo,
} from "../components.jsx";
import { FindingCard } from "./Review.jsx";

/**
 * F11: download the receipt as JSON. Uses a Blob + object URL so the file
 * lands in the user's downloads with no server round-trip and no library.
 */
function downloadReceiptJson(receipt) {
  const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${receipt.receiptId}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has grabbed the blob already.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ContentDetail({ param, role, toast, onActivity }) {
  const [content, setContent] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("findings");
  const [comment, setComment] = useState("");
  const [decision, setDecision] = useState({});

  const load = useCallback(async () => {
    try {
      setContent(await api.content(param));
    } catch (e) {
      setError(e.message);
    }
  }, [param]);

  useEffect(() => {
    setContent(null);
    setError(null);
    load();
  }, [load]);

  useEffect(() => {
    if (tab === "receipt" && content?.status === "approved" && !receipt) {
      api.receipt(param).then(setReceipt).catch(() => setReceipt(null));
    }
  }, [tab, content, param, receipt]);

  if (error)
    return (
      <Empty
        icon="🔍"
        title="Content not found"
        sub={`${error} — it may have been created in a different session.`}
      />
    );
  if (!content) return <Loading label="Loading content…" />;

  const act = async (fn, payload, okMsg) => {
    setBusy(true);
    try {
      const r = await fn(payload);
      if (r?.content) setContent((c) => ({ ...c, ...r.content }));
      else await load();
      toast(okMsg, "success");
      onActivity?.();
    } catch (e) {
      const hint = e.detail?.requiredRole ? ` — needs ${e.detail.requiredRole}` : "";
      toast(e.message + hint, "error");
    } finally {
      setBusy(false);
    }
  };

  const submitFinding = async (f, action) => {
    const d = decision[f.id] ?? {};
    if (action === "dispute" && !d.reason?.trim()) {
      toast("A dispute needs a reason", "error");
      return;
    }
    if (action === "edit" && !d.replacement?.trim()) {
      toast("An edit needs replacement text", "error");
      return;
    }
    await act(
      (payload) => api.findingDecision(f.id, payload),
      action === "accept"
        ? { action }
        : action === "edit"
          ? { action, replacement: d.replacement }
          : { action, reason: d.reason },
      action === "accept" ? "Finding accepted" : action === "edit" ? "Edited — re-reviewed as a new version" : "Finding disputed"
    );
    setDecision((x) => ({ ...x, [f.id]: {} }));
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    await act((payload) => api.comment(param, payload), { body: comment }, "Comment posted");
    setComment("");
    await load();
  };

  const openFindings = (content.findings ?? []).filter((f) => !f.status);
  const decidedFindings = (content.findings ?? []).filter((f) => f.status);

  const TABS = [
    { key: "findings", label: `Findings (${(content.findings ?? []).length})` },
    { key: "versions", label: `Versions (${content.versions?.length ?? 0})` },
    { key: "comments", label: `Comments (${content.comments?.length ?? 0})` },
    { key: "audit", label: `Audit (${content.audit?.length ?? 0})` },
    ...(content.status === "approved" ? [{ key: "receipt", label: "Receipt" }] : []),
  ];

  return (
    <>
      <PageIntro>
        One content item, end to end. Decide each finding individually (accept / edit / dispute), then
        move it through the workflow. <strong>The server enforces who may approve what</strong> — if your
        role is below the route's requirement you'll get a 403, and that attempt is written to the audit
        trail.
      </PageIntro>

      <div className="grid grid-side">
        <div className="col">
          <Card
            title={content.title}
            action={
              <div className="row" style={{ gap: 6 }}>
                {statusPill(content.status)}
                {riskPill(
                  content.counts?.high > 0 || (content.findings ?? []).some((f) => f.needsHuman)
                    ? "high"
                    : (content.counts?.total ?? 0) > 0
                      ? "medium"
                      : "none"
                )}
                <AIBadge ai={content.ai} />
                {content.sampleData && <span className="sample-tag">sample</span>}
              </div>
            }
          >
            <div className="small muted" style={{ marginBottom: 8 }}>
              {content.channel} · by {content.createdBy} ({content.creatorRole}) · v{content.version} ·
              route <strong>{content.route}</strong> → needs <span className="chip">{content.requiredRole}</span>
            </div>
            <div
              className="span-quote pre-wrap"
              style={{ maxHeight: 240, overflowY: "auto", fontSize: 12.5 }}
            >
              {content.text}
            </div>
          </Card>

          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.key} className={`tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "findings" && (
            <Card title={`Open findings (${openFindings.length})`}>
              {openFindings.length === 0 ? (
                <Empty
                  icon="✓"
                  title="All findings decided"
                  sub={decidedFindings.length ? "Move it through the workflow below." : "No findings on this content."}
                />
              ) : (
                openFindings.map((f) => (
                  <div key={f.id}>
                    <FindingCard f={f} text={content.text} />
                    <div className="row" style={{ gap: 6, margin: "6px 0 14px 12px", flexWrap: "wrap" }}>
                      <button
                        className="btn btn-xs btn-ok"
                        disabled={busy}
                        onClick={() => submitFinding(f, "accept")}
                        title={
                          f.verifiedSuggestion
                            ? `Applies the verified fix "${f.verifiedSuggestion}", bumps the version and re-reviews`
                            : "No verified fix for this one — records your decision only"
                        }
                      >
                        ✓ Accept
                      </button>
                      <input
                        className="input"
                        placeholder="Replacement text…"
                        value={decision[f.id]?.replacement ?? ""}
                        onChange={(e) => setDecision((d) => ({ ...d, [f.id]: { ...d[f.id], replacement: e.target.value } }))}
                        style={{ width: 230, padding: "3px 8px", fontSize: 11.5 }}
                      />
                      <button
                        className="btn btn-xs"
                        disabled={busy}
                        onClick={() => submitFinding(f, "edit")}
                        title="Replaces the span, bumps the version, re-reviews"
                      >
                        ✎ Edit
                      </button>
                      <input
                        className="input"
                        placeholder="Dispute reason (required)…"
                        value={decision[f.id]?.reason ?? ""}
                        onChange={(e) => setDecision((d) => ({ ...d, [f.id]: { ...d[f.id], reason: e.target.value } }))}
                        style={{ width: 200, padding: "3px 8px", fontSize: 11.5 }}
                      />
                      <button className="btn btn-xs btn-danger" disabled={busy} onClick={() => submitFinding(f, "dispute")}>
                        ⚑ Dispute
                      </button>
                    </div>
                  </div>
                ))
              )}

              {decidedFindings.length > 0 && (
                <>
                  <div className="divider" />
                  <h4 style={{ marginBottom: 8 }}>Decided ({decidedFindings.length})</h4>
                  {decidedFindings.map((f) => (
                    <div key={f.id} className={`finding sev-${f.severity}`}>
                      <div className="finding-head">
                        {severityPill(f.severity)}
                        {sourceChip(f)}
                        <span
                          className={`pill ${
                            f.status === "accepted" ? "pill-ok" : f.status === "disputed" ? "pill-warn" : "pill-info"
                          }`}
                        >
                          {f.status}
                        </span>
                      </div>
                      <div className="finding-body">
                        <div className="finding-issue">{f.issue}</div>
                        {f.spanText && (
                          <div className="small muted mono" style={{ marginTop: 4 }}>
                            “{f.spanText}”
                          </div>
                        )}
                        {f.reason && <div className="small muted mt">Reason: {f.reason}</div>}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </Card>
          )}

          {tab === "versions" && (
            <Card title="Version history">
              {(content.versions ?? []).length === 0 ? (
                <Empty icon="📄" title="No versions stored" />
              ) : (
                [...(content.versions ?? [])].reverse().map((v) => (
                  <div key={v.version} className="finding">
                    <div className="finding-head">
                      <span className="chip">v{v.version}</span>
                      <span className="small muted">by {v.createdBy ?? v.lastDecision?.actor ?? "engine"}</span>
                      <div className="spacer" />
                      {v.status && <span className="pill pill-neutral">{v.status}</span>}
                      <span className="xsmall muted">{timeAgo(v.updatedAt ?? v.createdAt)}</span>
                    </div>
                    <div className="finding-body">
                      {/* F10: show what this version changed relative to the
                          previous one. v1 is the baseline. */}
                      {Array.isArray(v.diff) && v.diff.some((s) => s.type !== "same") ? (
                        <>
                          <div className="xsmall muted" style={{ marginBottom: 5 }}>
                            Changed from v{v.version - 1}:
                          </div>
                          <div className="span-quote pre-wrap" style={{ maxHeight: 160, overflowY: "auto" }}>
                            {v.diff.map((s, i) =>
                              s.type === "same" ? (
                                <span key={i}>{s.text}</span>
                              ) : s.type === "del" ? (
                                <del key={i} className="diff-del">
                                  {s.text}
                                </del>
                              ) : (
                                <ins key={i} className="diff-add">
                                  {s.text}
                                </ins>
                              )
                            )}
                          </div>
                        </>
                      ) : v.diff === null ? (
                        <>
                          <div className="xsmall muted" style={{ marginBottom: 5 }}>
                            Baseline version — nothing to diff against.
                          </div>
                          <div className="span-quote pre-wrap" style={{ maxHeight: 160, overflowY: "auto" }}>
                            {v.text}
                          </div>
                        </>
                      ) : (
                        <div className="xsmall muted">
                          No text change in this version — the decision was recorded only.
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </Card>
          )}

          {tab === "comments" && (
            <Card title={`Comments (${content.comments?.length ?? 0})`}>
              <div className="row" style={{ alignItems: "flex-start", marginBottom: 12 }}>
                <textarea
                  className="textarea"
                  rows={2}
                  placeholder={`Add a comment as ${role}…`}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary" onClick={addComment} disabled={busy || !comment.trim()}>
                  Post
                </button>
              </div>
              {(content.comments ?? []).length === 0 ? (
                <Empty icon="💬" title="No comments yet" sub="Start the discussion above." />
              ) : (
                content.comments.map((c) => (
                  <div key={c.id} className={`comment ${c.parentId ? "reply" : ""}`}>
                    <div className="comment-head">
                      <span className="comment-author">{c.author}</span>
                      <span className="pill pill-neutral">{c.role}</span>
                      <div className="spacer" />
                      <span className="xsmall muted">{timeAgo(c.createdAt)}</span>
                    </div>
                    <div className="comment-body">{c.body}</div>
                  </div>
                ))
              )}
            </Card>
          )}

          {tab === "audit" && (
            <Card title="Audit trail (append-only by design)">
              {(content.audit ?? []).length === 0 ? (
                <Empty icon="⌗" title="No audit entries" />
              ) : (
                <div className="timeline">
                  {[...content.audit].reverse().map((a) => (
                    <div className="tl-item" key={a.id}>
                      <div className={`tl-dot ${a.type.replace(/[:]/g, "-")}`} />
                      <div className="tl-main">
                        <div className="tl-type">
                          {a.type}
                          {a.role && <span className="pill pill-neutral" style={{ marginLeft: 6 }}>{a.role}</span>}
                        </div>
                        <div className="tl-detail">{a.detail}</div>
                        <div className="tl-meta">
                          {a.actor} · {new Date(a.at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {tab === "receipt" && (
            <Card
              title="Approval receipt (F11 — hashed, tamper-evident record)"
              action={
                receipt && (
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => downloadReceiptJson(receipt)} title="Download the receipt as JSON">
                      ↓ JSON
                    </button>
                    <button className="btn btn-sm" onClick={() => window.print()} title="Print or save as PDF">
                      ⎙ PDF
                    </button>
                  </div>
                )
              }
            >
              {!receipt ? (
                <Loading label="Generating receipt…" />
              ) : (
                <div className="receipt">
                  <div className="receipt-id">
                    {receipt.receiptId}
                    <span className="pill pill-neutral" style={{ marginLeft: 8 }}>
                      hashed, tamper-evident record
                    </span>
                  </div>
                  <h2 style={{ margin: "4px 0 10px" }}>{receipt.content.title}</h2>
                  <dl className="kv">
                    <dt>Status</dt>
                    <dd>{statusPill(receipt.status)}</dd>
                    <dt>Record type</dt>
                    <dd className="mono">{receipt.recordType || "hashed, tamper-evident record"}</dd>
                    {receipt.contentHash && (
                      <>
                        <dt>Content hash (SHA-256)</dt>
                        <dd className="mono xsmall" style={{ wordBreak: "break-all" }}>{receipt.contentHash}</dd>
                      </>
                    )}
                    <dt>Approved by</dt>
                    <dd>
                      {receipt.approvedBy ?? "—"} {receipt.approvedAt && <span className="muted">· {new Date(receipt.approvedAt).toLocaleString()}</span>}
                    </dd>
                    <dt>Routed to</dt>
                    <dd>{receipt.routedTo}</dd>
                    <dt>Version</dt>
                    <dd>v{receipt.content.version}</dd>
                    <dt>Checks run</dt>
                    <dd>
                      {receipt.checksRun.rules} rules, {receipt.checksRun.facts} facts
                    </dd>
                    <dt>AI used</dt>
                    <dd>
                      {receipt.ai.used ? `yes — ${receipt.ai.provider}` : "no — deterministic checks only"}
                    </dd>
                    <dt>Data sent to AI</dt>
                    <dd>{receipt.dataSent.length ? receipt.dataSent.join(", ") : "nothing"}</dd>
                    <dt>Demo date</dt>
                    <dd className="mono">{receipt.demoDate}</dd>
                  </dl>

                  <div className="divider" />
                  <h4>Sources cited in this version</h4>
                  {receipt.sources.length === 0 ? (
                    <div className="small muted">No citations — the content made no factual claims.</div>
                  ) : (
                    receipt.sources.map((s) => (
                      <div className="row" key={s.id} style={{ marginBottom: 6, alignItems: "flex-start" }}>
                        <span className={`chip ${s.kind === "fact" ? "chip-fact" : "chip-rule"}`}>{s.id}</span>
                        <span className="small">{s.text}</span>
                        {s.validUntil && <span className="xsmall muted">valid until {s.validUntil}</span>}
                      </div>
                    ))
                  )}

                  <div className="divider" />
                  <h4>Version text</h4>
                  <div className="span-quote pre-wrap" style={{ maxHeight: 160, overflowY: "auto" }}>
                    {receipt.versionText}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="col">
          <Card title="Workflow (F8/F9)">
            <div className="col-sm">
              <div className="small muted" style={{ marginBottom: 8 }}>
                Acting as <strong>{role}</strong>. This content needs{" "}
                <span className="chip">{content.requiredRole}</span>.
              </div>
              <button
                className="btn"
                disabled={busy || content.status === "in_review"}
                onClick={() => act((p) => api.submit(p), {}, "Submitted for review")}
                style={{ width: "100%", justifyContent: "center" }}
              >
                ↑ Submit for review
              </button>
              <button
                className="btn btn-ok"
                disabled={busy || content.status === "approved"}
                onClick={() => act((p) => api.approve(p), {}, "Approved")}
                style={{ width: "100%", justifyContent: "center" }}
              >
                ✓ Approve
              </button>
              <input
                className="input"
                placeholder="Reason for changes…"
                value={decision.__changes ?? ""}
                onChange={(e) => setDecision((d) => ({ ...d, __changes: e.target.value }))}
              />
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={() =>
                  act((p) => api.requestChanges(p), { reason: decision.__changes }, "Changes requested")
                }
                style={{ width: "100%", justifyContent: "center" }}
              >
                ↩ Request changes
              </button>
              {content.status === "approved" && (
                <button
                  className="btn btn-accent"
                  onClick={() => setTab("receipt")}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  ⧉ View approval receipt
                </button>
              )}
            </div>
          </Card>

          <Card title="Facts & rules cited">
            {(() => {
              const ids = [...new Set((content.findings ?? []).map((f) => f.factId ?? f.ruleId).filter(Boolean))];
              if (ids.length === 0)
                return <div className="small muted">No sources cited — content made no verifiable claims.</div>;
              return ids.map((id) => (
                <div className="row" key={id} style={{ marginBottom: 6 }}>
                  <span className={`chip ${id.startsWith("F-") || id.startsWith("C-") ? "chip-fact" : "chip-rule"}`}>
                    {id}
                  </span>
                  <span className="xsmall muted">
                    {(content.findings ?? []).filter((f) => (f.factId ?? f.ruleId) === id).length} finding(s)
                  </span>
                </div>
              ));
            })()}
          </Card>

          <Card title="Content metadata" tight>
            <dl className="kv" style={{ fontSize: 11.5 }}>
              <dt>ID</dt>
              <dd className="mono">{content.id}</dd>
              <dt>Channel</dt>
              <dd>{content.channel}</dd>
              <dt>Creator</dt>
              <dd>{content.createdBy}</dd>
              <dt>Version</dt>
              <dd>v{content.version}</dd>
              <dt>Created</dt>
              <dd>{new Date(content.createdAt).toLocaleString()}</dd>
              <dt>Updated</dt>
              <dd>{timeAgo(content.updatedAt)}</dd>
              {content.scheduledFor && (
                <>
                  <dt>Scheduled</dt>
                  <dd className="mono">{content.scheduledFor}</dd>
                </>
              )}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
