/**
 * Insights screen (F13).
 *
 * Aggregates across all content: which rules get broken most, by whom, and
 * how humans resolve findings (accept vs edit vs dispute). Dispute-heavy
 * rules get a low clarity score — the spec's signal that a rule is ambiguous
 * and should be rewritten.
 */

import React, { Suspense, useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, ClarityMeter, Empty, Loading, PageIntro, Stat } from "../components.jsx";

// F17: the 3D constellation (and its three.js payload) is loaded lazily so it
// never slows the core path. Falls back to 2D in Constellation.jsx if WebGL is
// unavailable.
const Constellation = React.lazy(() => import("../components/Constellation.jsx"));

export default function Insights({ role, toast }) {
  const [insights, setInsights] = useState(null);
  const [kb, setKb] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.insights(), api.kb()])
      .then(([i, k]) => {
        setInsights(i);
        setKb(k);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <Empty icon="🔌" title="Could not load insights" sub={error} />;
  if (!insights || !kb) return <Loading label="Crunching the numbers…" />;

  const top8Rules = (insights.topRules || insights.topViolatedRules.slice(0, 8)) ?? [];
  const maxTopRule = Math.max(1, ...top8Rules.map((r) => r.count));
  const maxCreator = Math.max(1, ...(insights.byCreator || []).map((c) => c.findings));
  const ruleText = (id) =>
    kb.rules.find((r) => r.id === id)?.text ??
    kb.facts.find((f) => f.id === id)?.statement ??
    "";

  const workflow = insights.workflow ?? {
    byStatus: { draft: 0, in_review: 0, changes_requested: 0, approved: 0, scheduled: 0 },
    inReviewWaiting: { manager: 0, reviewer: 0 },
    avgApprovalTime: "not enough data",
    approvalsCount: 0,
  };

  const factHealth = insights.factHealth ?? [];
  const aiSummary = insights.aiSummary ?? {
    hasAiReviews: false,
    aiReviewsCount: 0,
    rulesOnlyReviewsCount: 0,
    totalReviews: 0,
    recentProvider: null,
    recentModel: null,
    downgradedFindingsCount: 0,
    totalFindingsCount: 0,
    downgradedSharePercent: 0,
  };

  const byCategory = insights.byCategory ?? [];
  const maxCategory = Math.max(1, ...byCategory.map((c) => c.count));

  return (
    <>
      <PageIntro>
        <strong>Insights</strong> turns the audit trail into decisions: which rules people actually break,
        who breaks them, and where humans disagree with the engine. A low{" "}
        <strong>clarity score</strong> means a rule draws many disputes — a sign the wording is ambiguous
        and should be rewritten, not that people are careless.
      </PageIntro>

      {/* Top Summary Stat Tiles */}
      <div className="grid grid-4">
        <Stat
          label="Contents reviewed"
          value={insights.totals.contents}
          note={`${insights.totals.liveContents} real · ${insights.totals.sampleContents} sample`}
          accent
        />
        <Stat
          label="Findings decided"
          value={insights.decisions.total}
          note={`${insights.decisions.acceptRate ?? 0}% accepted`}
        />
        <Stat
          label="Disputes"
          value={insights.decisions.disputed}
          note="human pushed back on the engine"
          tone={insights.decisions.disputed > 0 ? "bad" : "good"}
        />
        <Stat
          label="Edited"
          value={insights.decisions.edited}
          note="copy changed to comply"
          tone="info"
        />
      </div>

      {insights.sampleData && (
        <div className="page-intro mt" style={{ borderLeftColor: "var(--info)" }}>
          <div style={{ fontSize: 14 }}>📊</div>
          <div className="page-intro-text">
            Part of this data comes from <strong>seeded sample content</strong> so the dashboard isn't
            empty on first run. Figures incorporating seeded history carry a{" "}
            <span className="sample-tag">Sample data</span> tag.
          </div>
        </div>
      )}

      {/* ── PANEL 1: Most-broken rules (Top 8 horizontal bars, clicking goes to KB) ── */}
      <Card
        title="Most-broken rules"
        className="mt"
        action={
          <div className="row" style={{ gap: 6 }}>
            {insights.sampleData && <span className="sample-tag">Sample data</span>}
            <span className="xsmall muted">Click any bar to view in Knowledge Base</span>
          </div>
        }
      >
        {top8Rules.length === 0 ? (
          <div className="small muted">No broken rules recorded yet. Review content to see rule violation trends.</div>
        ) : (
          <div className="col" style={{ gap: 10 }}>
            {top8Rules.map((r) => {
              const ruleTitle = r.title || ruleText(r.ruleId);
              return (
                <div
                  key={r.ruleId}
                  onClick={() => (window.location.hash = `#/kb/${r.ruleId}`)}
                  style={{ cursor: "pointer" }}
                  title={`View ${r.ruleId} in Knowledge Base`}
                >
                  <div className="bar-row">
                    <span className="bar-label" style={{ fontWeight: 600 }}>
                      {r.ruleId}
                    </span>
                    <div className="bar-track">
                      <div
                        className={`bar-fill ${r.severity === "high" ? "high" : ""}`}
                        style={{ width: `${(r.count / maxTopRule) * 100}%` }}
                      />
                    </div>
                    <span className="bar-count">{r.count}</span>
                  </div>
                  <div
                    className="xsmall muted row"
                    style={{ marginLeft: 137, marginTop: 2, justifyContent: "space-between" }}
                  >
                    <span className="truncate" style={{ maxWidth: "75%" }}>
                      {ruleTitle}
                    </span>
                    <span className="nowrap" style={{ color: "var(--caramel)" }}>
                      View in KB →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── PANEL 2: Workflow status (Counts by status, waiting role, avg approval time) ── */}
      <Card
        title="Workflow status"
        className="mt"
        action={insights.sampleData && <span className="sample-tag">Sample data</span>}
      >
        {insights.totals.contents === 0 ? (
          <div className="small muted">No content in the workflow yet.</div>
        ) : (
          <>
            <div className="grid grid-5">
              <Stat label="Draft" value={workflow.byStatus.draft} tone="neutral" />
              <Stat label="In review" value={workflow.byStatus.in_review} accent />
              <Stat
                label="Changes requested"
                value={workflow.byStatus.changes_requested}
                tone={workflow.byStatus.changes_requested > 0 ? "warn" : "neutral"}
              />
              <Stat label="Approved" value={workflow.byStatus.approved} tone="good" />
              <Stat label="Scheduled" value={workflow.byStatus.scheduled} tone="info" />
            </div>

            <div className="row mt" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12, paddingTop: 10, borderTop: "1px solid var(--line-soft)" }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="small strong">In-review triage:</span>
                <span className="pill pill-neutral">
                  Waiting on Manager: <strong>{workflow.inReviewWaiting.manager}</strong>
                </span>
                <span className={`pill ${workflow.inReviewWaiting.reviewer > 0 ? "pill-high" : "pill-neutral"}`}>
                  Waiting on Reviewer: <strong>{workflow.inReviewWaiting.reviewer}</strong>
                </span>
              </div>

              <div className="row" style={{ gap: 8 }}>
                <span className="small strong">Avg. time to approval:</span>
                <span className={`pill ${workflow.avgApprovalTime !== "not enough data" ? "pill-ok" : "pill-neutral"}`}>
                  {workflow.avgApprovalTime}
                </span>
                {workflow.avgApprovalTime === "not enough data" && (
                  <span className="xsmall muted">(requires at least 2 completed approvals)</span>
                )}
              </div>
            </div>
          </>
        )}
      </Card>

      {/* ── PANEL 3: Fact health (Sorted by soonest expiry, links to alerts) ── */}
      <Card
        title="Fact health"
        className="mt"
        action={
          <div className="row" style={{ gap: 6 }}>
            <span className="xsmall muted mono">demo date: {kb.demoDate}</span>
            {insights.sampleData && <span className="sample-tag">Sample data</span>}
          </div>
        }
      >
        {factHealth.length === 0 ? (
          <div className="small muted">No approved facts configured in the knowledge base.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Fact ID</th>
                  <th>Statement</th>
                  <th>Owner</th>
                  <th>Validity</th>
                  <th>Status</th>
                  <th>Reverse alerts</th>
                </tr>
              </thead>
              <tbody>
                {factHealth.map((f) => {
                  const isExp = f.expiryStatus === "expired";
                  const isToday = f.expiryStatus === "today";
                  return (
                    <tr key={f.factId} style={isExp ? { background: "#fdf1f0" } : undefined}>
                      <td>
                        <span className="chip chip-fact">{f.factId}</span>
                      </td>
                      <td className="small" style={{ maxWidth: 320 }}>
                        {f.statement}
                      </td>
                      <td className="muted nowrap">{f.owner}</td>
                      <td className="mono nowrap xsmall">{f.validUntil ?? "—"}</td>
                      <td className="nowrap">
                        <span className={`pill ${isExp ? "pill-bad" : isToday ? "pill-warn" : "pill-ok"}`}>
                          {f.expiryLabel}
                        </span>
                      </td>
                      <td className="nowrap">
                        <button
                          className={`btn btn-xs ${f.openAlertsCount > 0 ? "btn-warn" : ""}`}
                          onClick={() => (window.location.hash = `#/alerts/${f.factId}`)}
                          title={`View reverse alerts for ${f.factId}`}
                        >
                          {f.openAlertsCount > 0 ? `⚠ ${f.openAlertsCount} open alert(s) →` : "0 alerts →"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── PANEL 4: AI use summary ── */}
      <Card
        title="AI use summary"
        className="mt"
        action={insights.sampleData && <span className="sample-tag">Sample data</span>}
      >
        {!aiSummary.hasAiReviews ? (
          <div className="empty" style={{ padding: "20px 0" }}>
            <div className="empty-title">No AI-assisted reviews yet</div>
            <div className="empty-sub">
              All reviews in the system were run using deterministic rule checks. Submit copy with AI enabled to
              see AI usage trends.
            </div>
          </div>
        ) : (
          <div className="col" style={{ gap: 12 }}>
            <div className="grid grid-3">
              <Stat
                label="Reviews checked"
                value={aiSummary.aiReviewsCount}
                note={`${aiSummary.rulesOnlyReviewsCount} rules-only reviews`}
                tone="info"
              />
              <Stat
                label="Recent model"
                value={aiSummary.recentProvider || "supplied"}
                note={aiSummary.recentModel || "OpenAI-compatible"}
              />
              <Stat
                label="Citation downgrades"
                value={`${aiSummary.downgradedSharePercent}%`}
                note={`${aiSummary.downgradedFindingsCount} of ${aiSummary.totalFindingsCount} findings`}
                tone={aiSummary.downgradedFindingsCount > 0 ? "warn" : "good"}
              />
            </div>

            <div className="small muted">
              Findings that cite unknown rules or unverified spans are automatically downgraded to{" "}
              <strong>needs human decision</strong> by the F5 Citation Validator.
            </div>
          </div>
        )}
      </Card>

      {/* ── PANEL 5: Issues by category ── */}
      <Card
        title="Issues by category"
        className="mt"
        action={insights.sampleData && <span className="sample-tag">Sample data</span>}
      >
        {byCategory.length === 0 || byCategory.every((c) => c.count === 0) ? (
          <div className="small muted">No issues recorded across categories yet.</div>
        ) : (
          <div className="col" style={{ gap: 10 }}>
            {byCategory.map((c) => (
              <div key={c.category}>
                <div className="bar-row">
                  <span className="bar-label" style={{ fontWeight: 600 }}>
                    {c.category}
                  </span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${(c.count / maxCategory) * 100}%`,
                        background:
                          c.category === "Claims"
                            ? "var(--sev-high)"
                            : c.category === "Facts"
                            ? "var(--caramel)"
                            : c.category === "Terms"
                            ? "var(--forest)"
                            : "var(--info)",
                      }}
                    />
                  </div>
                  <span className="bar-count">
                    {c.count} <span className="xsmall muted">({c.sharePercent}%)</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── F17: Rule constellation (Lazy-loaded, preserved untouched) ── */}
      {top8Rules.length > 0 && (
        <Card title="Rule constellation" className="mt">
          <Suspense fallback={<Loading label="Loading 3D constellation…" />}>
            <Constellation rules={insights.topViolatedRules} ruleText={ruleText} toast={toast} />
          </Suspense>
          <div className="small muted mt">
            Each node is a rule: <strong>size = violations</strong>, <strong>colour = clarity</strong> —
            red means humans dispute it often, so the wording is probably ambiguous. Click a node to jump
            to that rule below.
          </div>
        </Card>
      )}

      {/* ── Secondary Panels: Creator breakdown & Clarity table ── */}
      <div className="grid grid-2 mt">
        <Card title="By creator" action={insights.sampleData && <span className="sample-tag">Sample data</span>}>
          {(insights.byCreator || []).length === 0 ? (
            <Empty icon="👤" title="No creators yet" />
          ) : (
            insights.byCreator.map((c) => (
              <div key={c.creator} style={{ marginBottom: 11 }}>
                <div className="bar-row">
                  <span className="bar-label" style={{ fontFamily: "inherit" }}>
                    {c.creator}
                  </span>
                  <div className="bar-track">
                    <div className="bar-fill high" style={{ width: `${(c.findings / maxCreator) * 100}%` }} />
                  </div>
                  <span className="bar-count">{c.findings}</span>
                </div>
                <div className="xsmall muted" style={{ marginLeft: 137, marginTop: 2 }}>
                  {c.contents} content(s) · {c.high} high-severity
                  {c.sampleData && " · sample"}
                </div>
              </div>
            ))
          )}
        </Card>

        <Card title="Decision mix" action={insights.sampleData && <span className="sample-tag">Sample data</span>}>
          <div className="row" style={{ gap: 0, height: 34, borderRadius: 6, overflow: "hidden" }}>
            {[
              ["Accepted", insights.decisions.accepted, "var(--forest)"],
              ["Edited", insights.decisions.edited, "var(--info)"],
              ["Disputed", insights.decisions.disputed, "var(--sev-med)"],
            ]
              .filter(([, n]) => n > 0)
              .map(([label, n, color]) => (
                <div
                  key={label}
                  style={{
                    width: `${(n / Math.max(1, insights.decisions.total)) * 100}%`,
                    background: color,
                    display: "grid",
                    placeItems: "center",
                    color: "#fff",
                    fontSize: 11.5,
                    fontWeight: 650,
                  }}
                  title={`${label}: ${n}`}
                >
                  {n > 0 && `${label} ${n}`}
                </div>
              ))}
          </div>
          {insights.decisions.total === 0 && (
            <div className="small muted mt">No decisions recorded yet — open a content item and decide its findings.</div>
          )}
        </Card>
      </div>

      <Card
        title="Rule clarity — where humans disagree with the engine"
        className="mt"
        action={insights.sampleData && <span className="sample-tag">Sample data</span>}
      >
        {insights.unclearRules.length === 0 ? (
          <Empty
            icon="✓"
            title="No disputed rules"
            sub="Every decided finding was accepted or edited. Clarity is high across the board."
          />
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Wording</th>
                  <th className="tbl-num">Total</th>
                  <th className="tbl-num">Accepted</th>
                  <th className="tbl-num">Edited</th>
                  <th className="tbl-num">Disputed</th>
                  <th>Clarity</th>
                </tr>
              </thead>
              <tbody>
                {insights.unclearRules.map((r) => (
                  <tr key={r.ruleId} id={`rule-${r.ruleId}`}>
                    <td>
                      <span className="chip chip-rule">{r.ruleId}</span>
                    </td>
                    <td className="small">{ruleText(r.ruleId)}</td>
                    <td className="tbl-num">{r.count}</td>
                    <td className="tbl-num">{r.accepted}</td>
                    <td className="tbl-num">{r.edited}</td>
                    <td className="tbl-num strong" style={{ color: "var(--sev-high)" }}>
                      {r.disputed}
                    </td>
                    <td>
                      <ClarityMeter clarity={r.clarity} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="small muted mt">
          Clarity = 100 × (1 − disputed ÷ decided). Below 50 the rule wording should be reviewed — a
          disputed finding costs a Reviewer's time every single time.
        </div>
      </Card>
    </>
  );
}
