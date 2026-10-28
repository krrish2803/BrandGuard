/** Small pure text helpers shared by the checks and the fact scan. */

/** All matches of a regex (adds the global flag if missing). Never loops forever. */
export function findAll(text, re) {
  const rx = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  const out = [];
  let m;
  while ((m = rx.exec(text)) !== null) {
    out.push(m);
    if (m.index === rx.lastIndex) rx.lastIndex += 1;
  }
  return out;
}

/** Split into sentences; each finding keeps a real substring span. */
export function sentences(text) {
  return text.split(/(?<=[.!?])\s+/).filter(Boolean);
}

export function wordCount(s) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** "monsoon sale" → "Monsoon Sale" */
export function titleCase(s) {
  return s.replace(/\b[A-Za-z]+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

/** Preserve the original span's leading capitalisation in the suggestion. */
export function matchCase(source, target) {
  if (/^[A-Z]/.test(source)) return target[0].toUpperCase() + target.slice(1);
  return target;
}

/** yyyy-mm-dd → "30 Sep 2026" */
export function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[m - 1]} ${y}`;
}

export function isExpired(fact, asOf) {
  return Boolean(fact.validUntil) && asOf > fact.validUntil;
}

/** 0..1 bigram Dice similarity, used as a meaning-preserved fallback score. */
export function similarity(a, b) {
  const grams = (s) => {
    const t = s.toLowerCase();
    const out = [];
    for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (!ga.length || !gb.length) return 0;
  const pool = [...gb];
  let hit = 0;
  for (const g of ga) {
    const i = pool.indexOf(g);
    if (i >= 0) {
      hit += 1;
      pool.splice(i, 1);
    }
  }
  return Math.round((2 * hit) / (ga.length + gb.length) * 100);
}
