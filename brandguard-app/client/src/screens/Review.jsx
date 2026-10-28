/**
 * Review screen (Home/Review).
 *
 * Paste text, pick a channel, press Review. The response shows every finding
 * with the exact span it flagged, the rule/fact it cites, whether that
 * citation verified (F5), and a verified suggestion (F7).
 *
 * The three seeded Brewloom examples are one click away so a reviewer can
 * reproduce the spec's expected outcomes without typing.
 */

import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import {
  AIBadge,
  Card,
  Empty,
  HighlightedText,
  Loading,
  PageIntro,
  severityPill,
  sourceChip,
} from "../components.jsx";

const CHANNELS = ["Email", "Instagram", "Packaging", "Web", "Ad", "In-store", "Agent"];

/** Read a File → base64 (no data-URL prefix; the server takes bare base64 too). */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
    fr.onerror = () => reject(new Error("could not read the file"));
    fr.readAsDataURL(file);
  });
}

export default function Review({ role, toast, onActivity }) {
  const [examples, setExamples] = useState([]);
  const [kb, setKb] = useState(null);
  const [text, setText] = useState("");
  const [channel, setChannel] = useState("Email");
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [agentPreview, setAgentPreview] = useState(null);
  // F2 + F16: an optional image with its alt text. The image is read in the
  // browser to base64 and posted alongside the text; the server decodes it and
  // runs the pure visual checks (palette, contrast, alt text).
  const [image, setImage] = useState(null); // { name, b64, type, size, url }
  const [altText, setAltText] = useState("");

  useEffect(() => {
    api.examples().then(setExamples).catch(() => {});
    api.kb().then(setKb).catch(() => {});
  }, []);

  const run = async () => {
    if (!text.trim()) {
      toast("Paste or pick some content first", "error");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await api.review({
        text,
        channel,
        useAi,
        // F2 + F16: send the image (if any) with the authored alt text.
        ...(image ? { image: image.b64, imageType: image.type, altText } : {}),
      });
      setResult(r);
      onActivity?.();
      toast(
        r.counts.total === 0
          ? "Clean — no findings, routes to Manager"
          : `${r.counts.total} finding(s); routes to ${r.route}`,
        r.counts.total === 0 ? "success" : "info"
      );
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const onPickImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      toast("Only PNG and JPEG images can be checked", "error");
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast("Image is over 5 MB — please use a smaller file", "error");
      e.target.value = "";
      return;
    }
    try {
      const b64 = await fileToBase64(file);
      setImage({ name: file.name, b64, type: file.type, size: file.size, url: URL.createObjectURL(file) });
      setResult(null);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const clearImage = () => {
    if (image?.url) URL.revokeObjectURL(image.url);
    setImage(null);
    setAltText("");
    setResult(null);
  };

  const runAgentCheck = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      setAgentPreview(await api.agentCheck(text, channel));
      toast("Agent check complete (F15)", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const sorted = result
    ? [...result.findings].sort((a, b) => {
        const rank = { high: 0, "needs-human": 1, medium: 2, low: 3 };
        return (rank[a.severity] ?? 4) - (rank[b.severity] ?? 4);
      })
    : [];

  return (
    <>
      <PageIntro>
        Paste content and press <strong>Review</strong>. The engine runs deterministic checks, then the{" "}
        <strong>citation validator (F5)</strong> rejects any finding that cites a rule or fact ID that
        doesn't exist, or whose quoted span isn't a verbatim substring — those become{" "}
        <strong>needs-human</strong> and force Reviewer routing. Every finding below shows exactly what
        was flagged and why.
      </PageIntro>

      <div className="grid grid-side-l">
        <div className="col">
          <Card title="Try a seeded example">
            {examples.length === 0 ? (
              <Loading label="Loading examples…" />
            ) : (
              examples.map((ex) => (
                <button
                  key={ex.id}
                  className="btn btn-sm"
                  style={{ width: "100%", justifyContent: "flex-start", marginBottom: 6, textAlign: "left" }}
                  onClick={() => {
                    setText(ex.text);
                    setChannel(ex.channel);
                    setResult(null);
                    setAgentPreview(null);
                  }}
                >
                  <span style={{ fontWeight: 650 }}>{ex.title}</span>
                  <span className="muted xsmall">· {ex.channel}</span>
                </button>
              ))
            )}
            {examples[0]?.expected && (
              <div className="small muted mt">
                These are the three examples from the spec; each has a documented expected outcome.
              </div>
            )}
          </Card>

          {kb && (
            <Card title="Detection signals" tight>
              <div className="small muted" style={{ lineHeight: 1.7 }}>
                <div>
                  <span className="chip chip-fact">{kb.facts.length}</span> facts/claims with expiry dates
                </div>
                <div>
                  <span className="chip chip-rule">{kb.rules.length}</span> rules across{" "}
                  {new Set(kb.rules.map((r) => r.category)).size} categories
                </div>
                <div className="mt small">
                  Today (demo date): <span className="mono">{kb.demoDate}</span>
                </div>
              </div>
            </Card>
          )}
        </div>

        <div className="col">
          <Card
            title="Content to review"
            action={
              <span className="xsmall muted">
                {text.length} chars · as {role}
              </span>
            }
          >
            <label className="field-label" htmlFor="channel">
              Channel
            </label>
            <select
              id="channel"
              className="select"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              style={{ marginBottom: 10 }}
            >
              {CHANNELS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>

            <label className="field-label" htmlFor="content">
              Content text
            </label>
            <textarea
              id="content"
              className="textarea"
              rows={9}
              placeholder="Paste an email, caption, packaging copy or ad text…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />

            <label className="row" style={{ marginTop: 9, gap: 7, fontSize: 12.5 }}>
              <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
              Also ask the AI model (F4) — findings still pass the citation gate
            </label>
            {useAi && !kb && null}

            {/* F2 + F16: optional image. Checked for palette, contrast and alt
                text — the same rules that govern the copy. */}
            <div className="mt">
              <label className="field-label" htmlFor="image">
                Image <span className="muted">(optional — PNG or JPEG, max 5 MB)</span>
              </label>
              {!image ? (
                <label className="image-drop" htmlFor="image">
                  <input
                    id="image"
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={onPickImage}
                    style={{ display: "none" }}
                  />
                  <span className="image-drop-ico">🖼</span>
                  <span className="small">Attach a creative to check it against the brand palette</span>
                </label>
              ) : (
                <div className="image-picked">
                  <img src={image.url} alt="" className="image-thumb" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="small" style={{ fontWeight: 600 }}>{image.name}</div>
                    <div className="xsmall muted">{Math.round(image.size / 1024)} KB</div>
                    <label className="field-label" htmlFor="alt" style={{ marginTop: 6 }}>Alt text</label>
                    <input
                      id="alt"
                      className="input"
                      placeholder="Describe the image for screen readers (5-125 chars)"
                      value={altText}
                      onChange={(e) => setAltText(e.target.value)}
                    />
                  </div>
                  <button className="btn btn-sm btn-ghost" onClick={clearImage} title="Remove image">
                    ✕
                  </button>
                </div>
              )}
            </div>

            <div className="row mt">
              <button className="btn btn-primary" onClick={run} disabled={busy}>
                {busy ? <span className="spinner" /> : "✎"} Run review
              </button>
              <button className="btn" onClick={runAgentCheck} disabled={busy} title="F15 agent endpoint">
                ⌘ Agent check
              </button>
              {text && (
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setText("");
                    setResult(null);
                    setAgentPreview(null);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </Card>

          {agentPreview && (
            <Card
              title="Agent check result (F15)"
              action={<span className="pill pill-info">same engine, same gate</span>}
            >
              <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                <span className={`pill ${agentPreview.ok ? "pill-ok" : "pill-bad"}`}>
                  {agentPreview.ok ? "approvable" : "not approvable"}
                </span>
                <span className="pill pill-neutral">route: {agentPreview.route}</span>
                <span className="pill pill-neutral">{agentPreview.counts.total} findings</span>
              </div>
              <div className="small muted">
                This hit <span className="mono">POST /api/agent/check</span> — the public API third-party
                AI tools use. It returns the same citation-validated findings the UI shows.
              </div>
            </Card>
          )}
        </div>
      </div>

      {result && (
        <div className="mt">
          <Card
            title={`Findings (${result.counts.total})`}
            action={
              <div className="row" style={{ gap: 7 }}>
                <AIBadge ai={result.ai} />
                <span className={`pill ${result.route === "Reviewer" ? "pill-high" : "pill-ok"}`}>
                  routes to {result.route}
                </span>
                {result.counts.needsHuman > 0 && (
                  <span className="pill pill-needs-human">{result.counts.needsHuman} needs human</span>
                )}
              </div>
            }
          >
            {sorted.length === 0 ? (
              <Empty
                icon="✓"
                title="No findings — this content is clean"
                sub={`It routes to Manager and can be approved without a Reviewer. ${result.counts.checksRun ?? ""}`}
              />
            ) : (
              sorted.map((f) => <FindingCard key={f.id} f={f} text={result.content?.text ?? text} />)
            )}

            <div className="divider" />
            <div className="row">
              <span className="small muted">
                Review saved as content <span className="mono">{result.contentId}</span> (version{" "}
                {result.content?.version ?? 1})
              </span>
              <div className="spacer" />
              <button
                className="btn btn-sm btn-accent"
                onClick={() => (window.location.hash = `#/content/${result.contentId}`)}
              >
                Open in queue →
              </button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

/** One finding: span, citation (verified or not), issue, suggestion. */
export function FindingCard({ f, text }) {
  return (
    <div className={`finding sev-${f.severity}`}>
      <div className="finding-head">
        {severityPill(f.severity)}
        {sourceChip(f)}
        {f.channel && <span className="pill pill-neutral">{f.channel}</span>}
        {f.status && (
          <span className={`pill ${f.status === "accepted" ? "pill-ok" : f.status === "disputed" ? "pill-warn" : "pill-info"}`}>
            {f.status}
          </span>
        )}
      </div>

      <div className="finding-body">
        {/* Visual findings (F16) carry a measurement, not a text span — so we
            show the measured evidence (colour swatches, ratio, dimensions)
            instead of pretending a hex code is a substring of the copy. */}
        {f.sourceType === "visual" ? (
          <VisualEvidence f={f} />
        ) : (
          f.spanText && (
            <div style={{ marginBottom: 7 }}>
              <span className="span-quote">
                <HighlightedText text={text} spanText={f.spanText} />
              </span>
            </div>
          )
        )}

        <div className="finding-issue">{f.issue}</div>

        <div className={`citation ${f.citationVerified ? "verified" : "unverified"}`}>
          <span className="citation-ico">{f.citationVerified ? "✓" : "⚠"}</span>
          <div className="citation-text">
            {f.citationVerified ? (
              <>
                <span className="src">
                  {f.factId ?? f.ruleId}
                </span>{" "}
                — {f.sourceQuote ? `“${f.sourceQuote}”` : f.issue}
                {f.sourceKind && <span className="muted"> · {f.sourceKind}</span>}
              </>
            ) : (
              <>
                <span className="src">Citation not verified</span> — {f.citationRejectReason}
                <br />
                <span className="muted">
                  A human must decide. This forces Reviewer routing regardless of severity.
                </span>
              </>
            )}
          </div>
        </div>

        {f.suggestionShown && f.verifiedSuggestion ? (
          <div className="suggestion">
            <div className="suggestion-label">
              Suggested fix (re-checked clean)
              {typeof f.intentKept === "number" && (
                <span
                  className="pill pill-ok"
                  style={{ marginLeft: 6, fontWeight: 700 }}
                  title="Share of the original meaning this replacement preserves (F7). Only shown once the fix re-checks clean and clears the intent threshold."
                >
                  intent kept {f.intentKept}%
                </span>
              )}
            </div>
            <div className="suggestion-text">{f.verifiedSuggestion}</div>
          </div>
        ) : f.suggestion && !f.needsHuman ? (
          <div className="small muted mt">
            No safe automated suggestion: it either still trips the same rule or changes the meaning too
            much (F7 gates it).
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The measured evidence behind a visual finding (F16): colour swatches with
 * their nearest approved match, the contrast ratio, or the alt-text problem.
 * Every number here was actually measured off the decoded pixels — the engine
 * does not estimate.
 */
function VisualEvidence({ f }) {
  const v = f.visual ?? {};
  return (
    <div className="visual-evidence">
      {v.kind === "palette" && Array.isArray(v.offPalette) && (
        <>
          <div className="xsmall muted" style={{ marginBottom: 5 }}>
            Off-palette colours found in the image (tolerance {v.tolerance}):
          </div>
          {v.offPalette.map((c) => (
            <div key={c.hex} className="swatch-row">
              <span className="swatch" style={{ background: c.hex }} title={c.hex} />
              <span className="mono small">{c.hex}</span>
              {typeof c.share === "number" && <span className="xsmall muted">{Math.round(c.share * 100)}% of pixels</span>}
              <span className="xsmall muted">→ nearest approved: {c.nearest} ({c.nearestHex}), distance {c.distance}</span>
            </div>
          ))}
        </>
      )}

      {v.kind === "contrast" && (
        <div className="swatch-row">
          <span className="swatch" style={{ background: v.bgColor }} title={`background ${v.bgColor}`} />
          <span className="swatch swatch-text" style={{ color: v.textColor }} title={`text ${v.textColor}`}>Aa</span>
          <span className="mono small">{v.textColor} on {v.bgColor}</span>
          <span className={`pill ${v.ratio < 4.5 ? "pill-bad" : "pill-ok"}`}>{v.ratio}:1</span>
          <span className="xsmall muted">needs ≥ 4.5:1</span>
        </div>
      )}

      {v.kind === "alt-text" && (
        <div className="xsmall muted">
          {v.present
            ? `Alt text checked: ${v.length} characters (${v.problem === "short" ? "too short" : v.problem === "long" ? "too long" : "unhelpful prefix"}).`
            : "No alt text was provided with this image."}
        </div>
      )}
    </div>
  );
}
