/** Small shared presentational components used across every screen. */

import React from "react";

export const SEVERITY_ORDER = { high: 0, "needs-human": 1, medium: 2, low: 3 };

export function severityPill(severity) {
  const s = severity ?? "low";
  return <span className={`pill pill-${s}`}>{s === "needs-human" ? "needs human" : s}</span>;
}

export function statusPill(status) {
  const map = {
    draft: ["neutral", "draft"],
    in_review: ["info", "in review"],
    changes_requested: ["warn", "changes requested"],
    approved: ["ok", "approved"],
    disputed: ["warn", "disputed"],
    scheduled: ["info", "scheduled"],
  };
  const [cls, label] = map[status] ?? ["neutral", status ?? "unknown"];
  return <span className={`pill pill-${cls}`}>{label}</span>;
}

export function riskPill(risk) {
  const map = { high: "pill-high", medium: "pill-medium", none: "pill-low" };
  return <span className={`pill ${map[risk] ?? "pill-neutral"}`}>{risk === "none" ? "clean" : risk}</span>;
}

export function sourceChip(finding) {
  if (finding.factId) return <span className="chip chip-fact">{finding.factId}</span>;
  if (finding.ruleId) return <span className="chip chip-rule">{finding.ruleId}</span>;
  return null;
}

export function PageIntro({ children }) {
  return (
    <div className="page-intro">
      <div style={{ fontSize: 14 }}>ℹ️</div>
      <div className="page-intro-text">{children}</div>
    </div>
  );
}

export function Card({ title, action, children, tight, className = "" }) {
  return (
    <div className={`card ${className}`}>
      {title && (
        <div className="card-head">
          <h3>{title}</h3>
          {action}
        </div>
      )}
      <div className={`card-body ${tight ? "tight" : ""}`}>{children}</div>
    </div>
  );
}

export function Stat({ label, value, note, accent, tone }) {
  return (
    <div className={`stat ${tone ?? (accent ? "accent" : "")}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

export function Empty({ icon = "📭", title, sub }) {
  return (
    <div className="empty">
      <div className="empty-ico">{icon}</div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
    </div>
  );
}

export function Loading({ label = "Loading…" }) {
  return (
    <div className="loading-pad">
      <span className="spinner" /> {label}
    </div>
  );
}

export function AIBadge({ ai }) {
  if (!ai?.used) {
    return (
      <span className="pill pill-neutral" title={ai?.reason ?? "no AI used"}>
        ⚙️ deterministic checks
      </span>
    );
  }
  return (
    <span className="pill pill-info" title={`provider: ${ai.provider}`}>
      🤖 AI-assisted · {ai.provider}
    </span>
  );
}

/** Highlight a span inside the content text (verbatim match only). */
export function HighlightedText({ text, spanText }) {
  if (!spanText || !text?.includes(spanText)) {
    return <span className="pre-wrap">{text}</span>;
  }
  const i = text.indexOf(spanText);
  return (
    <span className="pre-wrap">
      {text.slice(0, i)}
      <mark>{spanText}</mark>
      {text.slice(i + spanText.length)}
    </span>
  );
}

export function ClarityMeter({ clarity }) {
  if (clarity === null || clarity === undefined) {
    return <span className="muted xsmall">no decisions yet</span>;
  }
  const tone = clarity >= 80 ? "var(--forest)" : clarity >= 50 ? "var(--sev-med)" : "var(--sev-high)";
  const label = clarity >= 80 ? "clear" : clarity >= 50 ? "ok" : "unclear";
  return (
    <div className="clarity-meter">
      <div className="clarity-track">
        <div className="clarity-fill" style={{ width: `${clarity}%`, background: tone }} />
      </div>
      <span className="xsmall strong" style={{ color: tone }}>
        {clarity} · {label}
      </span>
    </div>
  );
}

export function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
