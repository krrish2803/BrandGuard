/**
 * BrandGuard app shell.
 *
 * Hash routing (no router dependency), a persistent sidebar, and the role
 * switcher the spec requires — the active role is sent with every request so
 * the server enforces permissions, not the browser.
 */

import React, { useCallback, useEffect, useState } from "react";
import { api, getSession, switchRole } from "./api.js";
import Dashboard from "./screens/Dashboard.jsx";
import Review from "./screens/Review.jsx";
import Queue from "./screens/Queue.jsx";
import ContentDetail from "./screens/ContentDetail.jsx";
import KnowledgeBase from "./screens/KnowledgeBase.jsx";
import Alerts from "./screens/Alerts.jsx";
import Insights from "./screens/Insights.jsx";
import AIPrivacy from "./screens/AIPrivacy.jsx";
import AuditLog from "./screens/AuditLog.jsx";
import AgentApi from "./screens/AgentApi.jsx";

const ROUTES = [
  { key: "dashboard", label: "Dashboard", ico: "▦", title: "Dashboard" },
  { key: "review", label: "Review content", ico: "✎", title: "Review" },
  { key: "queue", label: "Review queue", ico: "☰", title: "Queue" },
  { key: "kb", label: "Knowledge base", ico: "◫", title: "Knowledge Base" },
  { key: "alerts", label: "Reverse alerts", ico: "⚠", title: "Alerts" },
  { key: "insights", label: "Insights", ico: "◔", title: "Insights" },
  { key: "audit", label: "Audit log", ico: "⌗", title: "Audit Log" },
  { key: "ai", label: "AI & privacy", ico: "🤖", title: "AI & Privacy" },
  { key: "agent", label: "Agent API", ico: "⌘", title: "Agent API" },
];

const ROLES = [
  { value: "creator", label: "Creator", can: "Submit content for review" },
  { value: "manager", label: "Manager", can: "Approve Manager-routed content" },
  { value: "reviewer", label: "Reviewer", can: "Approve Reviewer-routed content (high-risk)" },
  { value: "admin", label: "Admin", can: "Edit facts, move demo date, everything" },
];

const SCREENS = {
  dashboard: Dashboard,
  review: Review,
  queue: Queue,
  // Content detail must be registered: five screens link to #/content/:id, and
  // parseHash falls back to the dashboard for any unregistered key — which
  // would silently swallow every "open this item" click.
  content: ContentDetail,
  kb: KnowledgeBase,
  alerts: Alerts,
  insights: Insights,
  audit: AuditLog,
  ai: AIPrivacy,
  agent: AgentApi,
};

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [key, ...rest] = raw.split("/");
  // Unknown keys fall back to the dashboard rather than a blank screen, but we
  // keep the attempted key so the shell can flag it — a silent fallback hides
  // broken links (it masked a missing screen registration during the build).
  const known = Boolean(key && SCREENS[key]);
  return {
    key: known ? key : "dashboard",
    param: rest.join("/") || null,
    unknown: Boolean(key) && !known,
    attempted: key || null,
  };
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [session, setSession] = useState(getSession);
  const [health, setHealth] = useState(null);
  const [counts, setCounts] = useState({ alerts: 0, queue: 0 });
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Establish a default session on first load so every screen has a role.
  useEffect(() => {
    if (!getSession()) switchRole("manager", "Priya (demo)").then(setSession).catch(() => {});
  }, []);

  const refreshShell = useCallback(async () => {
    try {
      const [h, contents, alerts] = await Promise.all([api.health(), api.contents(), api.alerts()]);
      setHealth(h);
      setCounts({
        alerts: alerts.alerts.filter((a) => !a.acked).length,
        queue: contents.filter((c) => c.status === "in_review" || c.status === "draft").length,
      });
    } catch {
      setHealth({ ok: false });
    }
  }, []);

  useEffect(() => {
    refreshShell();
    const t = setInterval(refreshShell, 15000);
    return () => clearInterval(t);
  }, [refreshShell]);

  const toast = useCallback((message, tone = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const DEMO_NAMES = {
    creator: "Aarav (creator)",
    manager: "Priya (manager)",
    reviewer: "Rahul (reviewer)",
    admin: "Meera (admin)",
  };

  const onRole = async (value) => {
    try {
      const s = await switchRole(value, DEMO_NAMES[value] ?? value);
      setSession(s);
      toast(`Now acting as ${value}`, "success");
      refreshShell();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const Screen = SCREENS[route.key];
  const meta = ROUTES.find((r) => r.key === route.key);
  const roleNow = session?.role ?? "manager";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <div className="brand-glyph">B</div>
            <div>
              <div className="brand-name">BrandGuard</div>
              <div className="brand-sub">Brewloom brand governance</div>
            </div>
          </div>
        </div>

        <nav className="nav">
          <div className="nav-label">Workspace</div>
          {ROUTES.slice(0, 3).map((r) => (
            <NavBtn key={r.key} route={r} active={route.key === r.key} counts={counts} />
          ))}
          <div className="nav-label">Knowledge & monitoring</div>
          {ROUTES.slice(3, 7).map((r) => (
            <NavBtn key={r.key} route={r} active={route.key === r.key} counts={counts} />
          ))}
          <div className="nav-label">Transparency</div>
          {ROUTES.slice(7).map((r) => (
            <NavBtn key={r.key} route={r} active={route.key === r.key} counts={counts} />
          ))}
        </nav>

        <div className="rolebox">
          <div className="rolebox-label">Acting as</div>
          <select
            className="role-select"
            value={roleNow}
            onChange={(e) => onRole(e.target.value)}
            aria-label="Role switcher"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <div className="role-hint">
            {ROLES.find((r) => r.value === roleNow)?.can}. Permissions are enforced by the server, not the
            browser.
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <span className="topbar-title">{meta?.title}</span>
          <span className="pill pill-neutral">{roleNow}</span>
          <div className="topbar-spacer" />
          {health ? (
            <span className="row" style={{ gap: 6 }}>
              <span className={`health-dot ${health.ok ? "ok" : "bad"}`} />
              <span className="xsmall muted">
                {health.ok ? `API live · db: ${health.db}` : "API unreachable"}
              </span>
            </span>
          ) : (
            <span className="xsmall muted">connecting…</span>
          )}
        </header>

        <div className="content">
          {route.unknown && (
            <div className="card" style={{ borderLeft: "3px solid var(--caramel)", marginBottom: 14 }}>
              <div className="small">
                <strong>Unknown page</strong> — nothing is registered at{" "}
                <span className="mono">#/{route.attempted}</span>, so you are seeing the dashboard instead.
              </div>
            </div>
          )}
          <Screen
            key={`${route.key}:${route.param ?? ""}`}
            param={route.param}
            role={roleNow}
            toast={toast}
            onActivity={refreshShell}
          />
        </div>

        {/* F14: the AI-disclosure page must be reachable from the footer of
            every screen, not just the sidebar. */}
        <footer className="app-footer">
          <span className="xsmall muted">
            BrandGuard · pre-publication brand governance for Brewloom
          </span>
          <div className="spacer" />
          <button className="btn btn-xs btn-ghost" onClick={() => (window.location.hash = "#/ai")}>
            🤖 AI disclosure
          </button>
          <button className="btn btn-xs btn-ghost" onClick={() => (window.location.hash = "#/agent")}>
            ⌘ Agent API
          </button>
          <button className="btn btn-xs btn-ghost" onClick={() => (window.location.hash = "#/audit")}>
            ⌗ Audit log
          </button>
        </footer>
      </div>

      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === "error" ? "error" : t.tone === "success" ? "success" : ""}`}>
            <span>{t.tone === "error" ? "⚠️" : t.tone === "success" ? "✓" : "ℹ️"}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NavBtn({ route, active, counts }) {
  const badge =
    route.key === "alerts" && counts.alerts > 0
      ? { n: counts.alerts, quiet: false }
      : route.key === "queue" && counts.queue > 0
        ? { n: counts.queue, quiet: true }
        : null;
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={() => (window.location.hash = `#/${route.key}`)}>
      <span className="nav-ico">{route.ico}</span>
      <span>{route.label}</span>
      {badge && <span className={`nav-badge ${badge.quiet ? "quiet" : ""}`}>{badge.n}</span>}
    </button>
  );
}
