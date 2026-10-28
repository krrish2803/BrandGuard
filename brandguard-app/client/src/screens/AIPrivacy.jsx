/**
 * AI & Privacy screen (F14).
 *
 * The disclosure the spec requires: which model runs, exactly what data it
 * sees, what is never sent, and what happens when it fails. Nothing here is
 * marketing — it is the runtime disclosure endpoint rendered as a page.
 */

import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, Empty, Loading, PageIntro, Stat } from "../components.jsx";

export default function AIPrivacy({ role, toast }) {
  const [d, setD] = useState(null);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api.disclosure().then(setD).catch((e) => toast(e.message, "error"));
    api.health().then(setHealth).catch(() => {});
  }, [toast]);

  if (!d) return <Loading label="Loading disclosure…" />;

  return (
    <>
      <PageIntro>
        <strong>AI & privacy (F14)</strong> is the transparency contract. When AI is enabled it only ever
        receives the content text plus the specific rules and facts retrieved for that text — never the
        whole knowledge base, never user identities, never the audit log. Every finding the model returns
        still passes the citation validator, so a hallucinated rule ID cannot become a finding.
      </PageIntro>

      <div className="grid grid-3">
        <Stat
          label="AI review"
          value={d.aiEnabled && d.providers.length ? "enabled" : "off"}
          note={d.providers.length ? d.providers.join(", ") : "deterministic checks only"}
          tone={d.aiEnabled && d.providers.length ? "good" : "info"}
        />
        <Stat
          label="PII redaction"
          value={d.redaction?.startsWith("on") ? "on" : "off"}
          note={d.redactedItems ? d.redactedItems.join(", ") : "email addresses, phone numbers"}
          tone={d.redaction?.startsWith("on") ? "good" : "info"}
        />
        <Stat
          label="Fallback"
          value="on"
          note="provider failure ⇒ deterministic checks, disclosed"
          tone="good"
        />
      </div>

      <div className="grid grid-2 mt">
        <Card title="What the model sees">
          <div className="col-sm">
            <div className="small strong">Sent to the provider</div>
            {d.dataSent.toProvider.map((f) => (
              <div className="row" key={f} style={{ gap: 7 }}>
                <span style={{ color: "var(--sev-med)" }}>→</span>
                <span className="small">{f}</span>
              </div>
            ))}
            <div className="divider" />
            <div className="small strong">Never sent</div>
            {d.dataSent.neverSent.map((f) => (
              <div className="row" key={f} style={{ gap: 7 }}>
                <span style={{ color: "var(--forest)" }}>✕</span>
                <span className="small muted">{f}</span>
              </div>
            ))}
            <div className="divider" />
            <div className="small strong">PII scrubbing (when enabled)</div>
            <div className="small muted">
              The regex scrubber scans text and strips exactly these items (and nothing more):
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              {(d.redactedItems || ["email addresses", "phone numbers"]).map((item) => (
                <span key={item} className="chip">{item}</span>
              ))}
            </div>
            <div className="xsmall muted" style={{ marginTop: 2 }}>
              Other PII forms (e.g. physical addresses, IDs) are not scrubbed.
            </div>
          </div>
        </Card>

        <Card title="What is stored & how it is validated">
          <div className="col-sm">
            <div className="small strong">Recorded per review</div>
            {d.stored.map((f) => (
              <div className="row" key={f} style={{ gap: 7 }}>
                <span style={{ color: "var(--info)" }}>•</span>
                <span className="small">{f}</span>
              </div>
            ))}
            <div className="divider" />
            <div className="small strong">Validation (F5)</div>
            <div className="small muted">{d.validation}</div>
            <div className="divider" />
            <div className="small strong">On failure</div>
            <div className="small muted">{d.fallback}</div>
          </div>
        </Card>
      </div>

      <Card title="The disclosure endpoint" className="mt">
        <div className="small muted" style={{ marginBottom: 8 }}>
          This page is a rendering of <span className="mono">GET /api/ai/disclosure</span> — the same JSON
          any auditor or integration can pull. Raw response:
        </div>
        <pre
          className="span-quote pre-wrap"
          style={{ maxHeight: 260, overflowY: "auto", fontSize: 11.5, margin: 0 }}
        >
          {JSON.stringify(d, null, 2)}
        </pre>
      </Card>

      {!d.providers.length && (
        <Card title="Enabling AI" className="mt">
          <div className="small" style={{ lineHeight: 1.7 }}>
            No provider is configured, so reviews run on deterministic checks alone — and say so honestly
            in every response. To enable F4, set the NVIDIA NIM key:
            <div className="mt">
              <span className="chip">NVIDIA_API_KEY</span> <span className="muted">— required</span>
            </div>
            <div style={{ marginTop: 4 }}>
              <span className="chip">NVIDIA_MODEL</span> <span className="muted">— optional, defaults to nemotron-3.5-bolt-e4b</span>
            </div>
            <div className="muted mt" style={{ marginTop: 8 }}>
              Restart the server after setting a key. Findings from the model still pass the
              citation validator before they reach a human.
            </div>
          </div>
        </Card>
      )}

      {health && (
        <Card title="Runtime" className="mt" tight>
          <dl className="kv">
            <dt>Database</dt>
            <dd className="mono">{health.db}</dd>
            <dt>Uptime</dt>
            <dd>{health.uptimeSec}s</dd>
            <dt>Checked at</dt>
            <dd>{new Date(health.at).toLocaleString()}</dd>
          </dl>
        </Card>
      )}
    </>
  );
}
