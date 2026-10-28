/**
 * Agent API screen (F15).
 *
 * The public API surface third-party AI tools use to check content and pull
 * brand context. Lets you run a live check from the UI and see the exact JSON
 * an integrator would get back.
 */

import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, Empty, Loading, PageIntro, severityPill, sourceChip } from "../components.jsx";

export default function AgentApi({ role, toast }) {
  const [ctx, setCtx] = useState(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.agentContext().then(setCtx).catch((e) => toast(e.message, "error"));
  }, [toast]);

  const run = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      setResult(await api.agentCheck(text, "Agent"));
      toast("Agent check complete", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (!ctx) return <Loading label="Loading agent context…" />;

  return (
    <>
      <PageIntro>
        <strong>Agent API (F15)</strong> exposes the same engine to external AI tools. An integrator pulls
        the brand context once, then posts draft copy to the check endpoint and gets back{" "}
        <strong>citation-validated findings</strong> — identical in structure to what this UI shows, because
        it is the same code path.
      </PageIntro>

      <div className="grid grid-side">
        <div className="col">
          <Card title="Try a live agent check">
            <textarea
              className="textarea textarea-mono"
              rows={7}
              placeholder={"Paste copy to check, e.g.\nOur cold brew is the fastest delivery in 3 cities."}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="row mt">
              <button className="btn btn-primary" onClick={run} disabled={busy || !text.trim()}>
                {busy ? <span className="spinner" /> : "⌘"} POST /api/agent/check
              </button>
              {result && (
                <span className={`pill ${result.ok ? "pill-ok" : "pill-bad"}`}>
                  {result.ok ? "approvable" : "not approvable"}
                </span>
              )}
            </div>

            {result && (
              <div className="mt">
                <div className="row" style={{ gap: 7, marginBottom: 9 }}>
                  <span className="pill pill-neutral">route: {result.route}</span>
                  <span className="pill pill-neutral">{result.counts.total} findings</span>
                </div>
                {result.findings.length === 0 ? (
                  <Empty icon="✓" title="No findings — this copy is clean" />
                ) : (
                  result.findings.map((f, i) => (
                    <div key={i} className={`finding sev-${f.severity}`}>
                      <div className="finding-head">
                        {severityPill(f.severity)}
                        {sourceChip(f)}
                      </div>
                      <div className="finding-body">
                        {f.spanText && (
                          <div className="span-quote" style={{ marginBottom: 6 }}>
                            “{f.spanText}”
                          </div>
                        )}
                        <div className="finding-issue">{f.issue}</div>
                        {f.sourceQuote && (
                          <div className="citation verified">
                            <span className="citation-ico">✓</span>
                            <div className="citation-text">
                              <span className="src">{f.factId ?? f.ruleId}</span> — “{f.sourceQuote}”
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </Card>

          <Card title="Raw JSON response">
            <pre
              className="span-quote pre-wrap"
              style={{ maxHeight: 220, overflowY: "auto", fontSize: 11.5, margin: 0 }}
            >
              {result ? JSON.stringify(result, null, 2) : "// run a check to see the response"}
            </pre>
          </Card>
        </div>

        <div className="col">
          <Card title="Endpoints" tight>
            <div className="col-sm">
              <div>
                <span className="chip">POST</span>{" "}
                <span className="mono small">/api/agent/check</span>
                <div className="xsmall muted">{"{ text, channel } → { ok, route, counts, findings[] }"}</div>
              </div>
              <div className="divider" />
              <div>
                <span className="chip chip-fact">GET</span>{" "}
                <span className="mono small">/api/agent/context</span>
                <div className="xsmall muted">brand rules, facts, glossary, palette, competitors</div>
              </div>
            </div>
          </Card>

          <Card title="Brand context (what the agent pulls)">
            <dl className="kv" style={{ fontSize: 12 }}>
              <dt>Brand</dt>
              <dd className="strong">{ctx.brand}</dd>
              <dt>Demo date</dt>
              <dd className="mono">{ctx.demoDate}</dd>
              <dt>Rules</dt>
              <dd>{ctx.rules.length}</dd>
              <dt>Facts</dt>
              <dd>{ctx.facts.length}</dd>
              <dt>Glossary</dt>
              <dd>{ctx.glossary.length} terms</dd>
              <dt>Palette</dt>
              <dd>
                <span className="row" style={{ gap: 4 }}>
                  {ctx.palette.map((p) => (
                    <span
                      key={p.hex}
                      title={`${p.name} ${p.hex}`}
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        background: p.hex,
                        border: "1px solid var(--line)",
                      }}
                    />
                  ))}
                </span>
              </dd>
              <dt>Competitors</dt>
              <dd>{ctx.competitors.join(", ")}</dd>
            </dl>
          </Card>

          <Card title="Usage" tight>
            <pre className="span-quote pre-wrap" style={{ fontSize: 11, margin: 0 }}>
{`curl -X POST ${window.location.origin}/api/agent/check \\
  -H 'Content-Type: application/json' \\
  -d '{"text":"Your draft copy here","channel":"Email"}'`}
            </pre>
          </Card>
        </div>
      </div>
    </>
  );
}
