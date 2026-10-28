/** CLI demo: run the three Brewloom examples + the reverse-alert scenario. */
import { review, reverseAlerts, rules, facts } from "../src/index.js";
import { examples, seedItems } from "../src/seed.js";

const asOf = "2026-10-27";

for (const ex of examples) {
  const r = review(ex.text, { asOf, channel: ex.channel });
  console.log(`\n══ ${ex.title} ══`);
  console.log(r.findings.length === 0 ? "  ✓ clean — no findings" : "");
  for (const f of r.findings) {
    const tag = f.needsHuman ? " [NEEDS HUMAN]" : "";
    console.log(`  [${f.severity.toUpperCase()}] ${f.ruleId}${f.factId ? ` → ${f.factId}` : ""}${tag}`);
    console.log(`     span: "${f.spanText}"`);
    console.log(`     why : ${f.issue}`);
    console.log(`     src : ${f.sourceQuote ?? "(rejected: " + f.citationRejectReason + ")"}`);
    if (f.suggestionShown) {
      console.log(`     fix : "${f.verifiedSuggestion}" (intent kept ${f.intentKept}%)`);
    }
  }
  console.log(`  → route: ${r.route} | approvable: ${r.approvable}`);
}

console.log("\n══ F12 reverse alert: change F-OFFER 20% → 25% ══");
const after = facts.map((f) => (f.id === "F-OFFER" ? { ...f, approved: 25 } : f));
const { changed, alerts } = reverseAlerts(seedItems, facts, after, asOf);
console.log(`  changed: ${JSON.stringify(changed)}`);
for (const a of alerts) {
  console.log(`  ⚠ ${a.title} [${a.itemStatus}] — ${a.issue} (notify: ${a.owner})`);
}
