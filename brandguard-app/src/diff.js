/**
 * Version diff (F10) — pure module.
 *
 * Spec §12 requires the content detail screen to show "versions and diff", and
 * F10's acceptance test is "version list with diff". This computes a word-level
 * diff between two version texts so a reviewer can see exactly what a decision
 * changed.
 *
 * Same contract as the rest of the engine: strings in, segments out. No I/O,
 * no server, deterministic — testable with `vitest`.
 *
 * Strategy: trim the common prefix and suffix at word level first (a typical
 * accept/edit changes one word, so this collapses the problem to almost
 * nothing), then run LCS on what's left. The LCS is capped so a pathological
 * pair of long, wholly-different texts degrades to a single removed/added
 * block instead of allocating an unbounded table.
 *
 * @module diff
 */

/**
 * Split into tokens, keeping every character so the original text is exactly
 * reconstructable. Whitespace runs, word runs (letters/digits) and punctuation
 * each become their own token.
 *
 * Punctuation must be split off: with a whitespace-only split, "weekly." and
 * "weekly" are different tokens, so deleting " in Kolkata" would render as a
 * full-word replacement instead of the deletion it is.
 */
const TOKEN = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;

export function tokenize(text) {
  return String(text ?? "").match(TOKEN) ?? [];
}

/** Beyond this many DP cells we fall back to a coarse whole-block diff. */
const LCS_CELL_BUDGET = 400_000;

/**
 * Word-level diff of two texts.
 *
 * @param {string} before previous version text
 * @param {string} after  current version text
 * @returns {Array<{type: "same"|"add"|"del", text: string}>} adjacent segments
 *   of the same type are merged. Reconstructing the two inputs is exact:
 *   `segments.filter(s => s.type !== "add").map(s => s.text).join("")` === before,
 *   and `segments.filter(s => s.type !== "del").map(s => s.text).join("")` === after.
 */
export function diffWords(before, after) {
  const a = tokenize(before);
  const b = tokenize(after);

  // Common prefix.
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p += 1;

  // Common suffix (never overlapping the prefix we already kept).
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s += 1;

  const midA = a.slice(p, a.length - s);
  const midB = b.slice(p, b.length - s);

  const middle = lcsDiff(midA, midB);

  return merge([
    { type: "same", text: a.slice(0, p).join("") },
    ...middle,
    { type: "same", text: a.slice(a.length - s).join("") },
  ]);
}

/** Longest-common-subsequence diff over the trimmed middle sections. */
function lcsDiff(a, b) {
  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) return [{ type: "add", text: b.join("") }];
  if (b.length === 0) return [{ type: "del", text: a.join("") }];

  // Too big for a full table: report the honest coarse answer rather than
  // trying to allocate hundreds of megabytes.
  if (a.length * b.length > LCS_CELL_BUDGET) {
    return [
      { type: "del", text: a.join("") },
      { type: "add", text: b.join("") },
    ];
  }

  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * width + j] =
        a[i] === b[j]
          ? dp[(i + 1) * width + (j + 1)] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + (j + 1)]);
    }
  }

  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push(out, "same", a[i]);
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + (j + 1)]) {
      push(out, "del", a[i]);
      i += 1;
    } else {
      push(out, "add", b[j]);
      j += 1;
    }
  }
  while (i < n) {
    push(out, "del", a[i]);
    i += 1;
  }
  while (j < m) {
    push(out, "add", b[j]);
    j += 1;
  }
  return out;
}

function push(out, type, token) {
  const last = out[out.length - 1];
  if (last && last.type === type) last.text += token;
  else out.push({ type, text: token });
}

/** Collapse adjacent same-type segments and drop empties. */
function merge(segments) {
  const out = [];
  for (const seg of segments) {
    if (!seg.text) continue;
    const last = out[out.length - 1];
    if (last && last.type === seg.type) last.text += seg.text;
    else out.push({ type: seg.type, text: seg.text });
  }
  return out;
}
