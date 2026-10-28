/**
 * Store: typed access to collections + id generation.
 * Normalizes Mongo cursors vs. in-memory arrays so callers never care.
 */

import { collection, state } from "./db.js";

async function all(result) {
  return typeof result?.toArray === "function" ? result.toArray() : result;
}

/* ── RegExp ⇄ {"$regex":src,"$flags":fl} so patterns survive JSON/BSON ──
 * The seed knowledge base stores detection patterns as real RegExps
 * (e.g. /monsoon\s+sale/i). Both the in-memory store (JSON round-trip) and
 * MongoDB (BSON) would silently flatten those to {} — so we tag them on the
 * way out and revive them on the way back in. */
function serializeRegExps(value) {
  if (value instanceof RegExp) return { $regex: value.source, $flags: value.flags };
  if (Array.isArray(value)) return value.map(serializeRegExps);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serializeRegExps(v)]));
  }
  return value;
}

function reviveRegExps(value) {
  if (Array.isArray(value)) return value.map(reviveRegExps);
  if (value && typeof value === "object") {
    if (typeof value.$regex === "string") return new RegExp(value.$regex, value.$flags ?? "");
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, reviveRegExps(v)]));
  }
  return value;
}

let counter = 0;
export function nextId(prefix) {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export const store = {
  rules: () => collection("rules"),
  facts: () => collection("facts"),
  contents: () => collection("contents"),
  versions: () => collection("versions"),
  audit: () => collection("audit"),
  alerts: () => collection("alerts"),

  async listRules() {
    return (await all(await collection("rules").find({}))).map(reviveRegExps);
  },
  async listFacts() {
    return (await all(await collection("facts").find({}))).map(reviveRegExps);
  },
  async getRule(id) {
    const r = await collection("rules").findOne({ id });
    return r ? reviveRegExps(r) : null;
  },
  async getFact(id) {
    const f = await collection("facts").findOne({ id });
    return f ? reviveRegExps(f) : null;
  },
  async upsertRule(rule) {
    await collection("rules").replaceOne({ id: rule.id }, serializeRegExps(rule));
  },
  async upsertFact(fact) {
    await collection("facts").replaceOne({ id: fact.id }, serializeRegExps(fact));
  },
  async listContents(filter = {}) {
    return all(await collection("contents").find(filter));
  },
  async getContent(id) {
    return collection("contents").findOne({ id });
  },
  async saveContent(doc) {
    // Version snapshots carry an explicit contentId so listVersions can match.
    await collection("versions").replaceOne(
      { contentId: doc.id, version: doc.version },
      { ...doc, contentId: doc.id },
      { upsert: true }
    );
    const { versions, ...content } = doc;
    await collection("contents").replaceOne({ id: doc.id }, content);
    return content;
  },
  async listVersions(contentId) {
    const rows = await all(await collection("versions").find({ contentId }));
    return rows.sort((a, b) => a.version - b.version);
  },
  async appendAudit(entry) {
    await collection("audit").replaceOne({ id: entry.id }, entry, { upsert: true });
    return entry;
  },
  async listAudit(filter = {}) {
    const rows = await all(await collection("audit").find(filter));
    return rows.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  },
  async replaceAlertsFor(contentId, alerts) {
    const c = collection("alerts");
    await c.deleteMany({ contentId });
    for (const a of alerts) await c.replaceOne({ id: a.id }, a, { upsert: true });
  },
  async listAlerts(filter = {}) {
    return all(await collection("alerts").find(filter));
  },
  comments: () => collection("comments"),
  settings: () => collection("settings"),
  async listComments(contentId) {
    const rows = await all(await collection("comments").find({ contentId }));
    return rows.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  },
  async addComment(doc) {
    await collection("comments").replaceOne({ id: doc.id }, doc, { upsert: true });
    return doc;
  },
  async getSetting(key, fallback = null) {
    const row = await collection("settings").findOne({ key });
    return row ? row.value : fallback;
  },
  async setSetting(key, value) {
    await collection("settings").replaceOne({ key }, { key, id: `setting:${key}` }, { upsert: true });
    await collection("settings").updateOne({ key }, { value });
    return value;
  },
  backend: () => (state.isMemory ? "memory" : "mongo"),
};

export function now() {
  return new Date().toISOString();
}
