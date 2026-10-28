/**
 * Knowledge Base screen (F1).
 *
 * Everything the engine checks against: rules, facts & claims (each with an
 * expiry date and an owning team), the glossary of preferred/banned terms, and
 * the approved palette. Admins can edit facts here — which triggers the
 * reverse-alert scan (F12).
 */

import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, Empty, Loading, PageIntro } from "../components.jsx";

export default function KnowledgeBase({ param, role, toast, onActivity }) {
  const [kb, setKb] = useState(null);
  const initialTab = param && (param.startsWith("F-") || param.startsWith("C-")) ? "facts" : "rules";
  const [tab, setTab] = useState(initialTab);
  const [editing, setEditing] = useState(null); // fact being edited
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  const load = () => api.kb().then(setKb).catch((e) => toast(e.message, "error"));
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (param && kb) {
      if (param.startsWith("F-") || param.startsWith("C-")) {
        setTab("facts");
      } else {
        setTab("rules");
      }
      setTimeout(() => {
        const el = document.getElementById(`rule-${param}`) || document.getElementById(`fact-${param}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [param, kb]);

  if (!kb) return <Loading label="Loading knowledge base…" />;

  const isAdmin = role === "admin";
  const expired = (f) => f.validUntil && f.validUntil < kb.demoDate;

  const startEdit = (f) => {
    setEditing(f.id);
    setForm({ approved: f.approved ?? "", validUntil: f.validUntil ?? "", statement: f.statement });
  };

  const saveFact = async () => {
    setBusy(true);
    try {
      const r = await api.updateFact(editing, {
        ...(form.approved !== "" && !Number.isNaN(Number(form.approved))
          ? { approved: Number(form.approved) }
          : {}),
        ...(form.validUntil ? { validUntil: form.validUntil } : {}),
        ...(form.statement !== kb.facts.find((f) => f.id === editing)?.statement
          ? { statement: form.statement }
          : {}),
      });
      toast(
        r.changed.length
          ? `Fact updated — ${r.alerts.length} reverse alert(s) fired`
          : "Fact updated — no items affected",
        r.alerts.length ? "info" : "success"
      );
      setEditing(null);
      await load();
      onActivity?.();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const categories = [...new Set(kb.rules.map((r) => r.category))];

  const TABS = [
    { key: "rules", label: `Rules (${kb.rules.length})` },
    { key: "facts", label: `Facts & claims (${kb.facts.length})` },
    { key: "glossary", label: `Glossary (${kb.glossary.length})` },
    { key: "brand", label: "Palette & competitors" },
  ];

  return (
    <>
      <PageIntro>
        The <strong>knowledge base</strong> is what the engine checks every piece of content against.{" "}
        <strong>Facts carry expiry dates and owning teams</strong> — when a fact changes or expires, every
        approved item that claimed it gets flagged. You are <strong>{role}</strong>
        {isAdmin ? " — you can edit facts below." : " — switch to Admin to edit facts."}
      </PageIntro>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "rules" && (
        <div className="col">
          {categories.map((cat) => (
            <Card key={cat} title={`${cat} (${kb.rules.filter((r) => r.category === cat).length})`}>
              {kb.rules
                .filter((r) => r.category === cat)
                .map((r) => (
                  <div
                    key={r.id}
                    id={`rule-${r.id}`}
                    className="row-top"
                    style={{
                      marginBottom: 9,
                      padding: r.id === param ? "6px 8px" : undefined,
                      borderRadius: r.id === param ? "var(--radius-sm)" : undefined,
                      background: r.id === param ? "var(--cream-2)" : undefined,
                      border: r.id === param ? "1px solid var(--caramel)" : undefined,
                    }}
                  >
                    <span className="chip chip-rule">{r.id}</span>
                    <div style={{ flex: 1 }}>
                      <div className="small">{r.text}</div>
                      <div className="xsmall muted mt" style={{ marginTop: 2 }}>
                        {r.severity} severity{r.requiresSource && " · requires a source"}
                      </div>
                    </div>
                  </div>
                ))}
            </Card>
          ))}
        </div>
      )}

      {tab === "facts" && (
        <Card
          title="Facts & claims"
          action={<span className="xsmall muted">demo date: {kb.demoDate}</span>}
        >
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Kind</th>
                  <th>Statement</th>
                  <th className="tbl-num">Value</th>
                  <th>Owner</th>
                  <th>Valid until</th>
                  <th>Status</th>
                  {isAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {kb.facts.map((f) => (
                  <tr
                    key={f.id}
                    id={`fact-${f.id}`}
                    style={{
                      background: f.id === param ? "var(--cream-2)" : expired(f) ? "#fdf1f0" : undefined,
                      outline: f.id === param ? "2px solid var(--caramel)" : undefined,
                    }}
                  >
                    <td>
                      <span className="chip chip-fact">{f.id}</span>
                    </td>
                    <td className="muted">{f.kind}</td>
                    <td>{f.statement}</td>
                    <td className="tbl-num mono">{f.approved ?? "—"}</td>
                    <td className="nowrap">{f.owner}</td>
                    <td className="mono nowrap">{f.validUntil ?? "—"}</td>
                    <td>
                      {expired(f) ? (
                        <span className="pill pill-bad">expired</span>
                      ) : (
                        <span className="pill pill-ok">valid</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="nowrap">
                        <button className="btn btn-xs" onClick={() => startEdit(f)} disabled={busy}>
                          ✎ Edit
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editing && (
            <div className="finding mt" style={{ borderLeft: "3px solid var(--caramel)" }}>
              <div className="finding-head">
                <span className="strong">Edit {editing}</span>
                <div className="spacer" />
                <button className="btn btn-xs btn-ghost" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
              <div className="finding-body">
                <div className="grid grid-3">
                  <div>
                    <label className="field-label">Approved value</label>
                    <input
                      className="input"
                      value={form.approved}
                      onChange={(e) => setForm((f) => ({ ...f, approved: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="field-label">Valid until (YYYY-MM-DD)</label>
                    <input
                      className="input mono"
                      placeholder="2026-12-31"
                      value={form.validUntil}
                      onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="field-label">Statement</label>
                    <input
                      className="input"
                      value={form.statement}
                      onChange={(e) => setForm((f) => ({ ...f, statement: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="small muted mt" style={{ marginTop: 9 }}>
                  Saving re-scans every approved/scheduled item and raises reverse alerts for any that now
                  claim something wrong (F12).
                </div>
                <div className="row mt">
                  <button className="btn btn-accent btn-sm" onClick={saveFact} disabled={busy}>
                    {busy ? <span className="spinner" /> : "💾"} Save & re-scan
                  </button>
                  <button className="btn btn-sm" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {tab === "glossary" && (
        <Card title="Preferred & banned terms">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Preferred</th>
                  <th>Banned</th>
                  <th>Rule</th>
                </tr>
              </thead>
              <tbody>
                {kb.glossary.map((g, i) => (
                  <tr key={i}>
                    <td className="strong">{g.preferred}</td>
                    <td>
                      <span className="row" style={{ gap: 5, flexWrap: "wrap" }}>
                        {g.banned.map((b) => (
                          <span key={b} className="pill pill-bad">
                            {b}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td>
                      <span className="chip chip-rule">{g.ruleId}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "brand" && (
        <div className="grid grid-2">
          <Card title="Approved palette">
            <div className="swatch-row">
              {kb.palette.map((p) => (
                <div className="swatch" key={p.hex}>
                  <div className="swatch-chip" style={{ background: p.hex }} />
                  <div className="swatch-meta">
                    <div className="swatch-name">{p.name}</div>
                    <div className="swatch-hex">{p.hex}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="small muted mt">
              Content using an unapproved hex would be flagged by the palette rule.
            </div>
          </Card>

          <Card title="Competitors (never name-drop in our copy)">
            <div className="row" style={{ gap: 7, flexWrap: "wrap" }}>
              {kb.competitors.map((c) => (
                <span key={c} className="pill pill-neutral">
                  {c}
                </span>
              ))}
            </div>
            <div className="small muted mt">
              Mentioning a competitor trips the "no name-dropping" rule and routes to Reviewer.
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
