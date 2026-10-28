/**
 * Fact expiry & reverse alerts (F12) — the main differentiator.
 *
 * Forward direction: content is checked against facts before publishing.
 * Reverse direction: when a fact changes (value edited, or its validity date
 * passes), scan every already-approved/scheduled item that references it and
 * tell the owner exactly which items are now wrong.
 */

import { detectFactMentions, expiredFacts } from "./facts.js";

/**
 * Scan stored content items for fact claims that are now wrong.
 *
 * @param {Array<{id, title, text, status, owner?}>} items approved/scheduled content
 * @param {Array} facts current fact/claim table
 * @param {string} asOf demo "today"
 * @returns {Array} reverse alerts, one per (item, fact) problem
 */
export function factscan(items, facts, asOf) {
  const alerts = [];
  const expiredIds = new Set(expiredFacts(facts, asOf).map((f) => f.id));

  for (const item of items ?? []) {
    for (const m of detectFactMentions(item.text ?? "", facts, asOf)) {
      if (m.status === "ok") continue;
      const fact = facts.find((f) => f.id === m.factId);
      alerts.push({
        itemId: item.id,
        title: item.title,
        itemStatus: item.status ?? "unknown",
        factId: m.factId,
        factStatement: m.statement,
        owner: m.owner ?? fact?.owner ?? "unassigned",
        status: m.status, // 'expired' | 'mismatch'
        issue:
          m.status === "expired"
            ? `Item still claims '${m.span}' but ${m.factId} expired ${m.validUntil}`
            : `Item claims '${m.span}' but ${m.factId} now approves ${m.approved}`,
        spanText: m.span,
        spanStart: m.spanStart,
        expiredFact: expiredIds.has(m.factId),
        severity: "high",
      });
    }
  }
  return alerts;
}

/**
 * Diff two fact tables (before → after an edit) and scan items for impact.
 * This is what the demo triggers when a judge changes the offer 20% → 25%.
 *
 * @param {Array<{id, title, text, status}>} items
 * @param {Array} factsBefore
 * @param {Array} factsAfter
 * @param {string} asOf
 * @returns {{changed: Array, alerts: Array}} which facts changed + affected items
 */
export function reverseAlerts(items, factsBefore, factsAfter, asOf) {
  const changed = [];
  for (const after of factsAfter) {
    const before = factsBefore.find((f) => f.id === after.id);
    if (!before) {
      changed.push({ factId: after.id, field: "added", from: null, to: after.approved });
      continue;
    }
    if (before.approved !== after.approved) {
      changed.push({ factId: after.id, field: "value", from: before.approved, to: after.approved });
    }
    if (before.validUntil !== after.validUntil) {
      changed.push({ factId: after.id, field: "validUntil", from: before.validUntil, to: after.validUntil });
    }
  }
  const changedIds = new Set(changed.map((c) => c.factId));
  const alerts = factscan(items, factsAfter, asOf).filter((a) => changedIds.has(a.factId));
  return { changed, alerts };
}

/**
 * Group alerts for the owner notification view: who must be told what.
 */
export function groupAlertsByOwner(alerts) {
  const byOwner = new Map();
  for (const a of alerts) {
    const key = a.owner ?? "unassigned";
    if (!byOwner.has(key)) byOwner.set(key, []);
    byOwner.get(key).push(a);
  }
  return [...byOwner.entries()].map(([owner, list]) => ({ owner, count: list.length, alerts: list }));
}
