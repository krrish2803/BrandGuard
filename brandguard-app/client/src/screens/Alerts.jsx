/**
 * Alerts screen (F12).
 *
 * Reverse alerts: approved/scheduled items that now claim something wrong
 * because a fact changed or expired. Grouped by the owning team, each alert
 * quotes the offending span so the owner knows exactly what to fix.
 *
 * The demo-date control moves "today" forward — the expiry half of F12.
 */

import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, Empty, Loading, PageIntro, timeAgo } from "../components.jsx";

export default function Alerts({ param, role, toast, onActivity }) {
  const [data, setData] = useState(null);
  const [kb, setKb] = useState(null);
  const [dateForm, setDateForm] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAcked, setShowAcked] = useState(false);
  const [activeFactFilter, setActiveFactFilter] = useState(param ?? null);

  useEffect(() => {
    if (param) setActiveFactFilter(param);
  }, [param]);

  const load = () => api.alerts().then(setData).catch((e) => toast(e.message, "error"));
  useEffect(() => {
    load();
    api.kb().then((k) => {
      setKb(k);
      setDateForm(k.demoDate);
    }).catch(() => {});
  }, []);

  if (!data || !kb) return <Loading label="Loading alerts…" />;

  const open = data.alerts.filter((a) => !a.acked);
  const acked = data.alerts.filter((a) => a.acked);
  let visible = showAcked ? data.alerts : open;
  if (activeFactFilter) {
    visible = visible.filter((a) => a.factId === activeFactFilter);
  }
  const isAdmin = role === "admin";

  const ack = async (id) => {
    setBusy(true);
    try {
      await api.ackAlert(id);
      toast("Alert acknowledged", "success");
      await load();
      onActivity?.();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const moveDate = async () => {
    setBusy(true);
    try {
      const r = await api.moveDemoDate(dateForm);
      toast(`Demo date moved to ${r.demoDate} — ${r.alerts.length} alert(s) across ${r.scanned} item(s)`, "info");
      await load();
      onActivity?.();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageIntro>
        <strong>Reverse alerts (F12)</strong> close the loop between a fact and the copy that depends on
        it. When an admin edits a fact — or when its expiry date passes — every approved or scheduled item
        that now claims something wrong is flagged here and grouped by the team that owns the fact. This is
        the difference between "we approved it once" and "it is still true today."
      </PageIntro>

      <div className="grid grid-4">
        <Card title="Open alerts" tight>
          <div className="stat-value" style={{ fontSize: 30 }}>
            {open.length}
          </div>
          <div className="xsmall muted">awaiting an owner</div>
        </Card>
        <Card title="Acknowledged" tight>
          <div className="stat-value" style={{ fontSize: 30 }}>
            {acked.length}
          </div>
          <div className="xsmall muted">seen by a human</div>
        </Card>
        <Card title="Owners notified" tight>
          <div className="stat-value" style={{ fontSize: 30 }}>
            {data.byOwner.length}
          </div>
          <div className="xsmall muted">distinct teams</div>
        </Card>
        <Card title="Demo date" tight>
          <div className="mono strong" style={{ fontSize: 18 }}>
            {kb.demoDate}
          </div>
          <div className="xsmall muted">the engine's "today"</div>
        </Card>
      </div>

      {isAdmin && (
        <Card title="Move the demo date (admin)" className="mt">
          <div className="row" style={{ flexWrap: "wrap" }}>
            <input
              className="input mono"
              type="date"
              value={dateForm}
              onChange={(e) => setDateForm(e.target.value)}
              style={{ width: 170 }}
            />
            <button className="btn btn-accent" onClick={moveDate} disabled={busy || !dateForm}>
              {busy ? <span className="spinner" /> : "⏱"} Move date & re-scan
            </button>
            <span className="small muted">
              Moving past a fact's <span className="mono">validUntil</span> expires it, which re-flags every
              item that claimed it.
            </span>
          </div>
        </Card>
      )}

      <Card
        title={`Alerts (${visible.length})`}
        className="mt"
        action={
          <div className="row" style={{ gap: 6 }}>
            {activeFactFilter && (
              <span className="row" style={{ gap: 4, background: "var(--cream-2)", padding: "2px 8px", borderRadius: "var(--radius-sm)", fontSize: 12 }}>
                <span>Fact: <strong className="mono">{activeFactFilter}</strong></span>
                <button className="btn btn-xs btn-ghost" onClick={() => setActiveFactFilter(null)} style={{ padding: "0 4px" }} title="Show all facts">✕</button>
              </span>
            )}
            <button className="btn btn-sm" onClick={() => setShowAcked((s) => !s)}>
              {showAcked ? "Hide acknowledged" : `Show acknowledged (${acked.length})`}
            </button>
          </div>
        }
      >
        {visible.length === 0 ? (
          <Empty
            icon="✓"
            title="No open alerts"
            sub={
              isAdmin
                ? "Try editing a fact in the Knowledge Base, or move the demo date past an expiry."
                : "Nothing needs an owner's attention right now."
            }
          />
        ) : (
          <div className="col">
            {data.byOwner.map((o) => {
              const theirs = visible.filter((a) => a.owner === o.owner);
              if (theirs.length === 0) return null;
              return (
                <div key={o.owner}>
                  <div className="row" style={{ marginBottom: 8 }}>
                    <span className="pill pill-warn">{o.owner}</span>
                    <span className="xsmall muted">
                      {theirs.length} alert(s) · notified via owner queue
                    </span>
                  </div>
                  {theirs.map((a) => (
                    <div key={a.id} className={`alert-card ${a.acked ? "acked" : ""}`} style={{ marginBottom: 8 }}>
                      <div className="row-top">
                        <div style={{ flex: 1 }}>
                          <div className="alert-issue">{a.issue}</div>
                          <div className="row" style={{ gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                            <span className="chip chip-fact">{a.factId}</span>
                            <button
                              className="btn btn-xs"
                              onClick={() => (window.location.hash = `#/content/${a.itemId}`)}
                            >
                              {a.contentTitle ?? a.itemId} →
                            </button>
                            <span className="xsmall muted">
                              {a.contentStatus && `status: ${a.contentStatus}`}
                            </span>
                            {a.sample && <span className="sample-tag">sample</span>}
                          </div>
                          {a.spanText && <div className="alert-snip">“{a.spanText}”</div>}
                          <div className="xsmall muted" style={{ marginTop: 5 }}>
                            {a.acked
                              ? `acknowledged by ${a.ackedBy} · ${timeAgo(a.ackedAt)}`
                              : `raised ${timeAgo(a.createdAt)}`}
                          </div>
                        </div>
                        {!a.acked && (
                          <button className="btn btn-sm btn-ok" disabled={busy} onClick={() => ack(a.id)}>
                            ✓ Acknowledge
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
