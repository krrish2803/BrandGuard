/** Seed the knowledge base on first start when empty (spec §9). */

import {
  rules as seedRules,
  facts as seedFacts,
  glossary,
  palette,
  competitors,
  examples,
  seedItems,
} from "../src/seed.js";
import { store, nextId, now } from "./store.js";

export async function seedIfEmpty() {
  const existing = await store.listRules();
  if (existing.length > 0) return { seeded: false };

  for (const r of seedRules) await store.upsertRule({ ...r, createdAt: now() });
  for (const f of seedFacts) await store.upsertFact({ ...f, createdAt: now() });

  // Content items (approved/scheduled) for the reverse-alert demo.
  for (const item of seedItems) {
    await store.saveContent({
      id: item.id,
      title: item.title,
      channel: item.channel,
      text: item.text,
      status: item.status, // 'approved' | 'scheduled'
      createdBy: item.createdBy,
      scheduledFor: item.scheduledFor ?? null,
      version: 1,
      sampleData: true,
      findings: [],
      route: "Manager",
      createdAt: now(),
      updatedAt: now(),
    });
  }

  // Glossary / palette / competitors ride along as a single config doc.
  await store.upsertRule({
    id: "KB-CONFIG",
    category: "Config",
    severity: "low",
    text: "Brand knowledge-base configuration",
    glossary,
    palette,
    competitors,
    examples: examples.map((e) => ({ id: e.id, title: e.title, channel: e.channel })),
    createdAt: now(),
  });

  await store.appendAudit({
    id: nextId("audit"),
    type: "seed",
    actor: "system",
    detail: `Seeded ${seedRules.length} rules, ${seedFacts.length} facts, ${seedItems.length} content items (sample data)`,
    at: now(),
    sampleData: true,
  });

  return { seeded: true, rules: seedRules.length, facts: seedFacts.length, items: seedItems.length };
}
