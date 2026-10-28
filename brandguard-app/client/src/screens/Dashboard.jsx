/**
 * Dashboard — the landing screen.
 *
 * Aggregates every backend collection into one view: what's waiting, what's
 * at risk, what the knowledge base contains, and what the last activity was.
 * Nothing here is mocked; each tile names the endpoint it came from.
 */

import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import {
  Card,
  Empty,
  Loading,
  PageIntro,
  Stat,
  riskPill,
  statusPill,
  timeAgo,
} from "../components.jsx";

export default function Dashboard({ role, toast }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [contents, alerts, kb, insights, health, disclosure] = await Promise.all([
          api.contents(),
          api.alerts(),
          api.kb(),
          api.insights(),
          api.health(),
          api.disclosure(),
        ]);
        if (!alive) return;
        setData({ contents, alerts, kb, insights, health, disclosure });
      } catch (e) {
        if (alive) setError(e.message);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <Empty icon="🔌" title="Could not reach the API" sub={error} />;
  if (!data) return <Loading label="Loading dashboard…" />;

  const { contents, alerts, kb, insights, health, disclosure } = data;
  const openAlerts = alerts.alerts.filter((a) => !a.acked);
  const inReview = contents.filter((c) => c.status === "in_review");
  const drafts = contents.filter((c) => c.status === "draft");
  const approved = contents.filter((c) => c.status === "approved");
  const needsReviewer = contents.filter((c) => c.requiredRole === "reviewer" && c.status !== "approved");
  const expiredFacts = kb.facts.filter((f) => f.validUntil && f.validUntil < (kb.demoDate ?? ""));
  const recent = [...contents].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")).slice(0, 6);

  const topRule = insights.topViolatedRules[0];

  return (
    <>
      <PageIntro>
        Every number below is read live from the API. <strong>BrandGuard reviews content before it
        ships</strong> — each finding cites the exact rule or fact it comes from, and every fact carries
        an expiry date so approved copy can be re-flagged when the world changes. You are acting as{" "}
        <strong>{role}</strong>.
      </PageIntro>

      <div className="grid grid-4">
        <Stat
          label="Awaiting review"
          value={inReview.length + drafts.length}
          note={`${inReview.length} in review · ${drafts.length} draft`}
          accent
        />
        <Stat
          label="Needs a Reviewer"
          value={needsReviewer.length}
          note="High-risk or unverifiable findings"
          tone={needsReviewer.length ? "bad" : "good"}
        />
        <Stat
          label="Open reverse alerts"
          value={openAlerts.length}
          note={`${alerts.alerts.length} total · grouped by owner`}
          tone={openAlerts.length ? "bad" : "good"}
        />
        <Stat
          label="Facts expired"
          value={expiredFacts.length}
          note={`as of ${kb.demoDate}`}
          tone={expiredFacts.length ? "bad" : "good"}
        />
      </div>

      <div className="grid grid-side mt">
        <Card
          title="Recent activity"
          action={
            <button className="btn btn-sm" onClick={() => (window.location.hash = "#/queue")}>
              Open queue →
            </button>
          }
        >
          {recent.length === 0 ? (
            <Empty
              icon="✎"
              title="No content yet"
              sub="Paste something into the Review screen to get started."
            />
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Content</th>
                    <th>Channel</th>
                    <th>Status</th>
                    <th>Risk</th>
                    <th>Findings</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((c) => (
                    <tr
                      key={c.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => (window.location.hash = `#/content/${c.id}`)}
                    >
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <span className="truncate" style={{ maxWidth: 240 }}>
                            {c.title}
                          </span>
                          {c.sampleData && <span className="sample-tag">sample</span>}
                        </div>
                      </td>
                      <td className="muted">{c.channel}</td>
                      <td>{statusPill(c.status)}</td>
                      <td>{riskPill(c.risk)}</td>
                      <td className="tbl-num">{c.findingCount}</td>
                      <td className="muted nowrap">{timeAgo(c.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="col">
          <Card title="Knowledge base at a glance">
            <dl className="kv">
              <dt>Brand</dt>
              <dd className="strong">{kb.brand}</dd>
              <dt>Rules</dt>
              <dd>{kb.rules.length} active</dd>
              <dt>Facts & claims</dt>
              <dd>{kb.facts.length}</dd>
              <dt>Glossary terms</dt>
              <dd>{kb.glossary.length}</dd>
              <dt>Palette</dt>
              <dd>
                <span className="row" style={{ gap: 4 }}>
                  {kb.palette.map((p) => (
                    <span
                      key={p.hex}
                      title={`${p.name} ${p.hex}`}
                      style={{
                        width: 15,
                        height: 15,
                        borderRadius: 3,
                        background: p.hex,
                        border: "1px solid var(--line)",
                        display: "inline-block",
                      }}
                    />
                  ))}
                </span>
              </dd>
              <dt>Demo date</dt>
              <dd className="mono">{kb.demoDate}</dd>
            </dl>
            <div className="mt">
              <button className="btn btn-sm" onClick={() => (window.location.hash = "#/kb")}>
                Browse knowledge base →
              </button>
            </div>
          </Card>

          <Card title="System status">
            <div className="col-sm">
              <div className="row">
                <span className={`health-dot ${health.ok ? "ok" : "bad"}`} />
                <span className="small">
                  API <strong>{health.ok ? "live" : "down"}</strong> · db{" "}
                  <span className="mono">{health.db}</span>
                </span>
              </div>
              <div className="row">
                <span className={`health-dot ${disclosure.aiEnabled && disclosure.providers.length ? "ok" : "warn"}`} />
                <span className="small">
                  AI provider{" "}
                  <strong>
                    {disclosure.providers.length ? disclosure.providers.join(", ") : "not configured"}
                  </strong>
                  {!disclosure.providers.length && " — deterministic checks only"}
                </span>
              </div>
              <div className="row">
                <span className="health-dot ok" />
                <span className="small">
                  Citation validator (F5) <strong>on</strong> — every finding must cite a real source
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-2 mt">
        <Card title="Most-violated rules">
          {insights.topViolatedRules.length === 0 ? (
            <Empty icon="✓" title="No findings recorded yet" />
          ) : (
            <>
              {insights.topViolatedRules.slice(0, 6).map((r) => {
                const max = insights.topViolatedRules[0].count;
                const rule = kb.rules.find((x) => x.id === r.ruleId);
                return (
                  <div className="bar-row" key={r.ruleId} title={rule?.text}>
                    <span className="bar-label">{r.ruleId}</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(r.count / max) * 100}%` }} />
                    </div>
                    <span className="bar-count">{r.count}</span>
                  </div>
                );
              })}
              <div className="small muted mt">
                {topRule && (
                  <>
                    Top: <span className="mono">{topRule.ruleId}</span> —{" "}
                    {kb.rules.find((x) => x.id === topRule.ruleId)?.text ?? "see knowledge base"}
                  </>
                )}
              </div>
            </>
          )}
        </Card>

        <Card title="Open reverse alerts by owner">
          {alerts.byOwner.length === 0 ? (
            <Empty icon="✓" title="No open alerts" sub="Edit a fact to see reverse alerts fire." />
          ) : (
            alerts.byOwner.map((o) => (
              <div className="bar-row" key={o.owner}>
                <span className="bar-label" style={{ fontFamily: "inherit" }}>
                  {o.owner}
                </span>
                <div className="bar-track">
                  <div className="bar-fill warn" style={{ width: `${Math.min(100, o.count * 25)}%` }} />
                </div>
                <span className="bar-count">{o.count}</span>
              </div>
            ))
          )}
          <div className="mt">
            <button className="btn btn-sm" onClick={() => (window.location.hash = "#/alerts")}>
              Review alerts →
            </button>
          </div>
        </Card>
      </div>
    </>
  );
}
