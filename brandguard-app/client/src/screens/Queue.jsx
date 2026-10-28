/**
 * Queue screen.
 *
 * Every stored content item, filtered by status. Shows the route the engine
 * assigned and — critically — which role must act next, so a manager knows
 * what they can approve and what has to go to a Reviewer.
 */

import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Card, Empty, Loading, PageIntro, riskPill, statusPill, timeAgo } from "../components.jsx";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "in_review", label: "In review" },
  { key: "draft", label: "Draft" },
  { key: "changes_requested", label: "Changes requested" },
  { key: "approved", label: "Approved" },
];

export default function Queue({ role, toast, onActivity }) {
  const [contents, setContents] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = () => api.contents().then(setContents).catch((e) => toast(e.message, "error"));

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!contents) return [];
    return contents.filter((c) => {
      if (filter !== "all" && c.status !== filter) return false;
      if (search && !`${c.title} ${c.channel} ${c.createdBy}`.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [contents, filter, search]);

  if (!contents) return <Loading label="Loading queue…" />;

  const counts = FILTERS.reduce(
    (acc, f) => ({
      ...acc,
      [f.key]: f.key === "all" ? contents.length : contents.filter((c) => c.status === f.key).length,
    }),
    {}
  );

  return (
    <>
      <PageIntro>
        The <strong>review queue</strong> lists every content item the engine has seen, newest first.
        The <strong>route</strong> column is decided by the engine: any high-severity or unverifiable
        finding sends it to a <strong>Reviewer</strong>, otherwise a <strong>Manager</strong> can approve.
        Click a row to open its findings, versions, comments and audit trail.
      </PageIntro>

      <Card
        title={`Queue (${filtered.length})`}
        action={
          <div className="filters">
            <input
              className="input"
              placeholder="Search title, channel, creator…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 200, padding: "4px 9px", fontSize: 12 }}
            />
          </div>
        }
      >
        <div className="filters" style={{ marginBottom: 12 }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`filter-btn ${filter === f.key ? "active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label} <span className="xsmall">({counts[f.key]})</span>
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <Empty
            icon="✓"
            title="Nothing here"
            sub={search ? "No items match your search." : "This filter is empty — that's a good sign."}
          />
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Content</th>
                  <th>Channel</th>
                  <th>Creator</th>
                  <th>Status</th>
                  <th>Risk</th>
                  <th>Route</th>
                  <th>Must act</th>
                  <th className="tbl-num">Findings</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => (window.location.hash = `#/content/${c.id}`)}
                  >
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <span className="truncate" style={{ maxWidth: 260 }}>
                          {c.title}
                        </span>
                        {c.sampleData && <span className="sample-tag">sample</span>}
                      </div>
                      <div className="xsmall muted mono">v{c.version} · {c.id}</div>
                    </td>
                    <td className="muted nowrap">{c.channel}</td>
                    <td className="nowrap">
                      {c.createdBy}
                      {c.creatorRole && <span className="xsmall muted"> · {c.creatorRole}</span>}
                    </td>
                    <td>{statusPill(c.status)}</td>
                    <td>{riskPill(c.risk)}</td>
                    <td className="nowrap">
                      <span className={`pill ${c.route === "Reviewer" ? "pill-high" : "pill-low"}`}>
                        {c.route}
                      </span>
                    </td>
                    <td className="nowrap">
                      <span className="chip">{c.requiredRole}</span>
                    </td>
                    <td className="tbl-num">
                      {c.findingCount}
                      {c.counts?.needsHuman > 0 && (
                        <span className="pill pill-needs-human" style={{ marginLeft: 5 }}>
                          {c.counts.needsHuman}
                        </span>
                      )}
                    </td>
                    <td className="muted nowrap">{timeAgo(c.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-3 mt">
        <Card title="What the statuses mean" tight>
          <div className="small muted" style={{ lineHeight: 1.8 }}>
            <div>
              <span className="mono">draft</span> — reviewed but not submitted
            </div>
            <div>
              <span className="mono">in_review</span> — with the approver
            </div>
            <div>
              <span className="mono">changes_requested</span> — sent back to the creator
            </div>
            <div>
              <span className="mono">approved</span> — cleared for publishing
            </div>
          </div>
        </Card>
        <Card title="Role enforcement (F9)" tight>
          <div className="small muted" style={{ lineHeight: 1.6 }}>
            The server rejects an approval from a role below the route's requirement and writes a{" "}
            <span className="mono">decision-blocked</span> audit entry. Switch roles in the sidebar to
            see it happen.
          </div>
        </Card>
        <Card title="Sample data" tight>
          <div className="small muted" style={{ lineHeight: 1.6 }}>
            Items tagged <span className="sample-tag">sample</span> were seeded so no screen is empty on
            first run. Everything else is real content you create.
          </div>
        </Card>
      </div>
    </>
  );
}
