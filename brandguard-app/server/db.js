/**
 * Database layer: MongoDB when reachable, in-memory fallback otherwise.
 *
 * The spec targets MongoDB Atlas (M0) in production. Locally, and in CI, the
 * server must still start — so if Mongo is unreachable within 2s we switch to
 * an in-memory store with the same API and mark `isMemory` for the /health
 * endpoint. Data is deep-copied on read/write so callers can't mutate the store.
 */

import { MongoClient } from "mongodb";

const DEFAULT_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.MONGODB_DB ?? "brandguard";

let client = null;
let db = null;
const memory = {
  rules: [],
  facts: [],
  contents: [],
  versions: [],
  audit: [],
  alerts: [],
  comments: [],
  settings: [],
};

export const state = {
  isMemory: true,
  uri: null,
};

function clone(v) {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

async function connect() {
  if (process.env.BRANDGUARD_FORCE_MEMORY === "1") return false;
  try {
    client = new MongoClient(DEFAULT_URI, { serverSelectionTimeoutMS: 2000 });
    await client.connect();
    db = client.db(DB_NAME);
    await db.command({ ping: 1 });
    state.isMemory = false;
    state.uri = DEFAULT_URI;
    return true;
  } catch {
    if (client) {
      try { await client.close(); } catch { /* ignore */ }
    }
    client = null;
    db = null;
    state.isMemory = true;
    state.uri = "memory://brandguard";
    return false;
  }
}

export async function initDb() {
  const ok = await connect();
  if (!ok) return { mode: "memory" };
  // Unique indexes for idempotent upserts.
  await Promise.all(
    ["rules", "facts", "contents", "versions", "audit", "alerts", "comments", "settings"].map((c) =>
      db.collection(c).createIndex({ id: 1 }, { unique: true, sparse: true }).catch(() => {})
    )
  );
  return { mode: "mongo" };
}

export async function closeDb() {
  if (client) await client.close();
}

/* ── Tiny collection API shared by both backends ─────────────────── */

function col(name) {
  if (db) return db.collection(name);
  const rows = memory[name];
  return {
    async find(filter = {}) {
      return rows.filter((r) => matches(r, filter)).map(clone);
    },
    async findOne(filter = {}) {
      const hit = rows.find((r) => matches(r, filter));
      return hit ? clone(hit) : null;
    },
    async insertOne(doc) {
      if (doc.id !== undefined && rows.some((r) => r.id === doc.id)) {
        const err = new Error(`duplicate key: ${doc.id}`);
        err.code = 11000;
        throw err;
      }
      rows.push(clone(doc));
      return { insertedId: doc.id };
    },
    async replaceOne(filter, doc, { upsert = true } = {}) {
      const i = rows.findIndex((r) => matches(r, filter));
      if (i >= 0) rows[i] = clone(doc);
      else if (upsert) rows.push(clone(doc));
      return { matchedCount: i >= 0 ? 1 : 0 };
    },
    async updateOne(filter, patch) {
      const i = rows.findIndex((r) => matches(r, filter));
      if (i >= 0) rows[i] = { ...rows[i], ...clone(patch) };
      return { matchedCount: i >= 0 ? 1 : 0 };
    },
    async deleteMany(filter = {}) {
      for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], filter)) rows.splice(i, 1);
    },
    async count(filter = {}) {
      return rows.filter((r) => matches(r, filter)).length;
    },
  };
}

function matches(doc, filter) {
  return Object.entries(filter).every(([k, v]) => doc[k] === v);
}

export function collection(name) {
  return col(name);
}

/** Wipe everything (tests only). */
export async function resetDb() {
  if (db) {
    for (const c of Object.keys(memory)) await db.collection(c).deleteMany({});
  }
  for (const rows of Object.values(memory)) rows.length = 0;
}
