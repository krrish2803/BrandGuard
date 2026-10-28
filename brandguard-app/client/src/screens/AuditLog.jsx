/**
 * Audit log screen (F10).
 *
 * The full append-only trail across every content item: reviews, findings,
 * decisions, blocked role attempts, reverse alerts, acknowledgements and
 * admin changes. Filterable by content ID or by event type.
 */

import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Card, Empty, Loading, PageIntro } from "../components.jsx";

export default function AuditLog({ role, toast }) {
  const [entries, setEntries] = useState(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.audit().then(setEntries).catch((e) => toast(e.message, "error"));
  }, [toast]);

  const types = useMemo(() => (entries ? [...new Set(entries.map((e) => e.type))].sort() : []), [entries]);

  const visible = useMemo(() => {
    if (!entries) return [];
    return [...entries]
      .reverse()
      .filter((e) => (filter ? e.type === filter : true))
      .filter((e) =>
        search ? `${e.detail} ${e.actor} ${e.contentId ?? ""}`.toLowerCase().includes(search.toLowerCase()) : true
      );
  }, [entries, filter, search]);

  if (!entries) return <Loading label="Loading audit log…" />;

  const typeColor = (t) => {
    if (t.includes("blocked")) return "var(--sev-high)";
    if (t.includes("approve")) return "var(--forest)";
    if (t.includes("alert")) return "var(--sev-med)";
    if (t.startsWith("finding")) return "var(--sev-high)";
    if (t === "reviewed") return "var(--info)";
    return "var(--caramel)";
  };

  return (
    <>
      <PageIntro>
        The <strong>audit log (F10)</strong> is append-only by design: every approval, dispute,
        blocked permission attempt and reverse alert stays on the record. This is what makes an approval
        receipt trustworthy — it is a view onto this trail, not a separate claim.
      </PageIntro>

      <Card
        title={`Audit entries (${visible.length} of ${entries.length})`}
        action={
          <div className="filters">
            <input
              className="input"
              placeholder="Search detail, actor, content…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 210, padding: "4px 9px", fontSize: 12 }}
            />
          </div>
        }
      >
        <div className="filters" style={{ marginBottom: 12 }}>
          <button className={`filter-btn ${filter === "" ? "active" : ""}`} onClick={() => setFilter("")}>
            All <span className="xsmall">({entries.length})</span>
          </button>
          {types.map((t) => (
            <button key={t} className={`filter-btn ${filter === t ? "active" : ""}`} onClick={() => setFilter(t)}>
              {t} <span className="xsmall">({entries.filter((e) => e.type === t).length})</span>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <Empty icon="⌗" title="No matching entries" />
        ) : (
          <div className="timeline">
            {visible.slice(0, 200).map((e) => (
              <div className="tl-item" key={e.id}>
                <div className="tl-dot" style={{ background: typeColor(e.type) }} />
                <div className="tl-main">
                  <div className="tl-type">
                    {e.type}
                    {e.role && (
                      <span className="pill pill-neutral" style={{ marginLeft: 6 }}>
                        {e.role}
                      </span>
                    )}
                    {e.contentId && (
                      <button
                        className="btn btn-xs btn-ghost"
                        style={{ marginLeft: 6 }}
                        onClick={() => (window.location.hash = `#/content/${e.contentId}`)}
                      >
                        {e.contentId} →
                      </button>
                    )}
                  </div>
                  <div className="tl-detail">{e.detail}</div>
                  <div className="tl-meta">
                    {e.actor} · {new Date(e.at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {visible.length > 200 && (
          <div className="small muted mt">Showing the 200 most recent of {visible.length} matching entries.</div>
        )}
      </Card>
    </>
  );
}
