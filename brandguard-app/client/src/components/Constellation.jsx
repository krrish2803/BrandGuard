/**
 * Rule constellation (F17) — the lazily-loaded 3D wrapper.
 *
 * Three.js is pulled in with React.lazy so it never joins the main bundle
 * (F17 acceptance: "Loads lazily; page works with 3D disabled"). If WebGL is
 * unavailable or the scene fails to load we render an equivalent 2D SVG
 * constellation instead — same nodes, same colours, same click behaviour — so
 * the insight is never lost. A "reduce motion" preference keeps the 3D view but
 * parks the auto-orbit and per-node bobbing (spec §12: respect reduced motion).
 *
 * The pure layout lives in ../constellation.js and is unit-tested without a
 * browser; this file only handles loading, capability detection and pick state.
 */

import React, { Suspense, useEffect, useState } from "react";
import { buildNodes } from "../constellation.js";
import { api } from "../api.js";
import { ClarityMeter, Empty, Loading } from "../components.jsx";

const ConstellationScene = React.lazy(() => import("../scene/ConstellationScene.jsx"));

/** Can this browser actually give us a WebGL context? */
function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

/** Respect the OS "reduce motion" setting — no auto-rotation, no bobbing. */
function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * If the lazy 3D chunk fails to load or throws while rendering (blocked
 * WebGL, a stale cached chunk, an old browser), fall back to the 2D view
 * rather than taking the whole Insights screen down with it.
 */
class SceneBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}

/** 2D fallback: same size/colour encoding, laid out on a flat disc. */
function Fallback2D({ nodes, activeRule, onPick }) {
  const R = 132; // disc radius in svg units
  const span = Math.max(1, ...nodes.map((n) => Math.hypot(n.x, n.z)));
  const toXY = (n) => [160 + (n.x / span) * R, 160 + (n.z / span) * R];
  const maxR = Math.max(1, ...nodes.map((n) => n.radius));
  const px = (r) => 6 + (r / maxR) * 20; // node radius in px

  return (
    <svg viewBox="0 0 320 320" style={{ width: "100%", height: 340, borderRadius: 10, background: "linear-gradient(180deg,#fbf7f1,#f1e7d9)" }} role="img" aria-label="Rule constellation (2D)">
      {nodes.map((n) => {
        const [cx, cy] = toXY(n);
        return (
          <line key={`l-${n.ruleId}`} x1={160} y1={160} x2={cx} y2={cy} stroke="#c8b8a4" strokeWidth={1} opacity={0.55} />
        );
      })}
      {nodes.map((n) => {
        const [cx, cy] = toXY(n);
        const active = activeRule === n.ruleId;
        return (
          <g key={n.ruleId} style={{ cursor: "pointer" }} onClick={() => onPick(n.ruleId)}>
            <circle
              cx={cx}
              cy={cy}
              r={px(n.radius)}
              fill={n.color}
              stroke={active ? "#3b2a20" : "#fff"}
              strokeWidth={active ? 2.5 : 1.5}
              opacity={0.92}
            />
            <title>{`${n.ruleId} · ${n.count} violation(s) · clarity ${n.band}`}</title>
          </g>
        );
      })}
      <circle cx={160} cy={160} r={4} fill="#3b2a20" />
    </svg>
  );
}

export default function Constellation({ rules = [], ruleText, toast }) {
  const { nodes } = buildNodes(rules, ruleText);
  const [mode, setMode] = useState("loading"); // loading | 3d | 2d
  const [animate, setAnimate] = useState(true);
  const [activeRule, setActiveRule] = useState(null);
  const [panel, setPanel] = useState(null); // fetched rule detail
  const [panelState, setPanelState] = useState("idle"); // idle | loading | error | ready

  // Capability detection before we even try to import three.js.
  useEffect(() => {
    if (!hasWebGL()) {
      setMode("2d");
      return;
    }
    setAnimate(!prefersReducedMotion());
    setMode("3d");
  }, []);

  // Opening a node = "opens that rule's findings" (spec §12): fetch every place
  // the rule was broken across all content.
  useEffect(() => {
    if (!activeRule) {
      setPanel(null);
      setPanelState("idle");
      return;
    }
    let cancelled = false;
    setPanelState("loading");
    api
      .ruleFindings(activeRule)
      .then((d) => {
        if (cancelled) return;
        setPanel(d);
        setPanelState("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setPanelState("error");
        toast?.(`Could not load findings for ${activeRule} — ${e.message}`, "error");
      });
    return () => {
      cancelled = true;
    };
  }, [activeRule, toast]);

  if (nodes.length === 0) return null;

  const pick = (ruleId) => setActiveRule((cur) => (cur === ruleId ? null : ruleId));

  return (
    <div>
      <div style={{ position: "relative" }}>
        {mode === "2d" ? (
          <Fallback2D nodes={nodes} activeRule={activeRule} onPick={pick} />
        ) : (
          <SceneBoundary fallback={<Fallback2D nodes={nodes} activeRule={activeRule} onPick={pick} />}>
            <Suspense fallback={<div className="constellation-loading">Loading 3D constellation…</div>}>
              <ConstellationScene nodes={nodes} activeRule={activeRule} onPick={pick} animate={animate} />
            </Suspense>
          </SceneBoundary>
        )}

        {/* Legend — size = violations, colour = clarity. */}
        <div className="constellation-legend">
          <span className="xsmall muted">size = violations · colour = clarity</span>
          <div className="constellation-swatches">
            <span><i style={{ background: "#1F5F4A" }} /> clear</span>
            <span><i style={{ background: "#A97C2C" }} /> ok</span>
            <span><i style={{ background: "#B3261E" }} /> unclear</span>
          </div>
        </div>
      </div>

      {/* "Clicking a node opens that rule's findings" — the panel shows every
          place this rule was broken, with the span, issue and a link to open
          the content it came from. */}
      {activeRule && (
        <div className="constellation-panel mt" id="constellation-readout">
          {panelState === "loading" && <Loading label={`Loading findings for ${activeRule}…`} />}

          {panelState === "error" && (
            <Empty icon="⚠️" title="Could not load findings" sub="Try another node." />
          )}

          {panelState === "ready" && panel && (
            <>
              <div className="finding-head">
                <span className="chip chip-rule">{panel.ruleId}</span>
                {panel.definition && <span className="small">{panel.definition.text}</span>}
                <div className="spacer" />
                {panel.clarity !== null && <ClarityMeter clarity={panel.clarity} />}
                <button className="btn btn-xs" onClick={() => setActiveRule(null)}>✕ close</button>
              </div>

              <div className="xsmall muted" style={{ margin: "6px 0 8px" }}>
                Broken {panel.counts.total} time(s) · {panel.counts.open} open ·{" "}
                {panel.counts.disputed} disputed
              </div>

              {panel.occurrences.length === 0 ? (
                <Empty icon="✓" title="No findings recorded" sub="This rule has never been flagged." />
              ) : (
                panel.occurrences.map((o) => (
                  <div key={o.findingId} className="finding" style={{ marginBottom: 8 }}>
                    <div className="finding-head">
                      <span className={`pill ${o.severity === "high" ? "pill-high" : o.severity === "medium" ? "pill-medium" : "pill-low"}`}>
                        {o.severity}
                      </span>
                      <span className="span-quote">“{o.spanText}”</span>
                      <div className="spacer" />
                      <span className="pill pill-neutral">{o.decision}</span>
                    </div>
                    <div className="finding-body">
                      <div className="small">{o.issue}</div>
                      {o.suggestion && (
                        <div className="xsmall" style={{ marginTop: 4 }}>
                          Suggested fix: <strong>{o.suggestion}</strong>
                        </div>
                      )}
                      <div className="row mt" style={{ gap: 8, alignItems: "center" }}>
                        <span className="xsmall muted">{o.title} · {o.channel}</span>
                        <button
                          className="btn btn-xs"
                          onClick={() => (window.location.hash = `#/content/${o.contentId}`)}
                        >
                          Open content →
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      )}

      {!activeRule && (
        <div className="xsmall muted mt" style={{ textAlign: "center" }}>
          Click a node to open that rule's findings.
        </div>
      )}
    </div>
  );
}
