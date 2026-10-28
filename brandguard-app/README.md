# BrandGuard — Review Engine + API

Pre-publication brand governance for **Brewloom** (demo brand), built for the
Codex 48 / Inkloom AI Round 2 spec.

Two halves:

1. **`src/` — the pure review engine.** No server, no database, no network.
   Text + knowledge base in → validated findings out. Fully covered by Vitest.
2. **`server/` — the Express API.** Persists the knowledge base and content
   versions, enforces human decisions and roles, and triggers reverse alerts.

## Core differentiators implemented

| | Feature | Where |
|---|---|---|
| **F5** | **Citation validator** — a finding citing an unknown rule/fact ID, or a span that is not a verbatim substring of the content, is downgraded to `needs-human` and routed to a Reviewer. AI findings go through exactly the same gate. | `src/validator.js` |
| **F12** | **Fact expiry & reverse alerts** — edit a fact (or let its validity date pass) and every approved/scheduled item that now claims something wrong is flagged and its owner notified. | `src/factscan.js`, `PUT /api/facts/:id` |

Plus: F1 knowledge base, F2 intake, F3 deterministic checks, F4 AI judgment
(Gemini → NVIDIA → deterministic fallback), F6 explained findings, F7 verified
suggestions, F8 human decisions, F9 server-side role enforcement, F10 append-only by design
audit log, F11 hashed tamper-evident approval receipt, F13/F14/F15/F18 API surface.

## Quick start

```bash
npm install
npm test          # 18 engine tests + 30 API tests (memory DB, no Mongo needed)
npm run demo      # CLI walkthrough: 3 examples + reverse-alert scenario
npm start         # API on :4000 (MongoDB if reachable, else in-memory)
```

MongoDB is optional: without it the server uses an in-memory store with the
same API (reported by `GET /api/health` as `"db": "memory"`). Point
`MONGODB_URI` at a real database for persistence.

AI is optional too: set `GEMINI_API_KEY` (or `NVIDIA_API_KEY`) to enable F4.
Without a key, `useAi: true` requests degrade gracefully to deterministic
checks and say so honestly in the response.

## API

```
GET  /api/health                    F18 liveness + db backend
GET  /api/knowledge                 F1 rules, facts, glossary, palette
GET  /api/examples                  the 3 Brewloom demo examples
POST /api/review                    F2 intake → F3/F4 checks → F5 → F6/F7 → F9 route
GET  /api/contents[/:id]            content + versions + audit trail
GET  /api/contents/:id/receipt      F11 hashed, tamper-evident approval receipt
POST /api/contents/:id/decision     F8 accept | edit | dispute (F9 role-checked)
GET  /api/audit                     F10 append-only by design audit log
PUT  /api/facts/:id                 F12 edit a fact → reverse-alert scan
GET  /api/alerts                    F12 pending alerts grouped by owner
GET  /api/insights                  F13 top violated rules, accept/dispute rates
GET  /api/ai/disclosure             F14 what the AI sees and what is stored
POST /api/agent/check               F15 check endpoint for AI tools
GET  /api/agent/context             F15 brand context for AI tools
```

### Roles (F9)

The server — not the client — decides who may approve what:

- content routed to **Manager** (no high/unverifiable findings) → `manager+`
- content routed to **Reviewer** (any high or needs-human finding) → `reviewer+`
- a wrong-role decision returns `403` and is audited as `decision-blocked`
- `dispute` is always allowed but requires a `reason`

## How F5 actually gates AI output

```
POST /api/review { "text": "...", "aiFindings": [{"ruleId": "R-HALLUCINATED", ...}] }
→ finding.citationVerified = false
→ finding.severity = "needs-human"
→ route = "Reviewer"
```

A model cannot invent a rule, cite a non-existent fact, or paraphrase the
offending text — all three are rejected with an explicit
`citationRejectReason`.

## How F12 demonstrates expiry

```bash
curl -X PUT localhost:4000/api/facts/F-OFFER \
  -H 'Content-Type: application/json' -d '{"approved": 25}'
→ changed: [{factId: "F-OFFER", field: "value", from: 20, to: 25}]
→ alerts: Welcome email + Weekend email (both still claim 20%), notify Marketing
```

`GET /api/alerts` keeps them until cleared; each alert is written to the audit
log as `reverse-alert`.

## Testing philosophy

- `test/engine.test.js` — the three spec examples must produce the documented
  outcomes; fabricated citations must be rejected; reverse alerts must fire.
- `test/api.test.js` — every endpoint above, including 400/403/404 paths and
  the audit trail. Runs on the in-memory backend (no Mongo needed in CI).
