# BrandGuard 🛡️

> Pre-publication brand governance: citation-grounded review engine, fact expiry & reverse alerts, tamper-evident audit trail, and real-time insights.

Built for the Codex 48 / Inkloom AI Round 2 spec.

---

## Repository Structure

```
.
├── brandguard-app/                  # Core governance platform & Express API
│   ├── client/                      # React 19 + Three.js frontend (Vite)
│   ├── public/                      # Compiled frontend assets & app entry
│   ├── server/                      # Express 5 backend API & storage
│   ├── src/                         # Pure review engine & citation validator
│   └── test/                        # Vitest test suites (116 tests)
├── brandguard-landing/              # Next.js product landing page & interactive demo
├── BrandGuard_Round1_Submission.pdf # Round 1 architecture & system design submission
├── BrandGuard_Round2_Build_Spec.pdf # Round 2 implementation specifications
└── README.md
```

---

## Applications

### 1. BrandGuard App (`brandguard-app`)
The full brand governance and review platform:
- **Citation Validator (F5):** Every finding citing an unapproved rule/fact ID, or a non-verbatim span, is downgraded to `needs-human` and routed to a Reviewer.
- **Fact Expiry & Reverse Alerts (F12):** Automatically detects expired or updated facts and alerts owners of existing approved/scheduled content citing them.
- **Insights Dashboard (F13):** Most-broken rules (top 8), workflow status & approval turnaround, fact health relative to demo date, AI usage & validator downgrades summary, and category breakdowns.
- **Append-only Audit Log (F10):** Tamper-evident operational audit trail across every review, decision, role enforcement, and reverse alert.
- **Approval Receipts (F11):** Hashed, tamper-evident approval records with SHA-256 content verification.
- **3D Rule Constellation:** Interactive Three.js/R3F visual graph of brand guidelines and connections.

#### Running the App
```bash
cd brandguard-app
npm install
npm test          # Runs 116 tests across engine, API, AI, and 3D constellation
npm run demo      # Interactive CLI demo with 3 examples & reverse alerts
npm start         # Starts backend on http://localhost:4000
```

### 2. BrandGuard Landing Page (`brandguard-landing`)
A modern Next.js landing page featuring:
- Hero section with interactive review simulation.
- Real-time demo showcase of the citation validation engine.
- Feature breakdown, interactive 3D visual elements, and architecture highlights.

#### Running the Landing Page
```bash
cd brandguard-landing
npm install
npm run dev       # Starts dev server on http://localhost:3000
```

---

## Testing & Quality

All engine and API tests run hermetically using an in-memory store without needing external database dependencies:
```bash
cd brandguard-app
npm test
```
- `test/constellation.test.js`: 15 tests passed
- `test/engine.test.js`: 43 tests passed
- `test/api.test.js`: 48 tests passed
- `test/ai.test.js`: 10 tests passed
- **Total: 116 tests passing.**
