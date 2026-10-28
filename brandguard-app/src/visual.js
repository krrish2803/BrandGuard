/**
 * Visual checks (F16) — the pure half.
 *
 * Same contract as the rest of the engine: values in, findings out. No image
 * decoding, no filesystem, no network. The *server* decodes an uploaded image
 * into the facts below (dominant colours, dimensions) and hands them here.
 *
 * Three checks, each citing a real seeded rule so the F5 citation validator
 * accepts them like any other finding:
 *   R-VIS-1   dominant colours vs the approved palette (lower confidence —
 *             colour extraction is heuristic, so we say so rather than lie)
 *   R-A11Y-1  alt text present and well-formed
 *   R-A11Y-3  WCAG contrast ratio of supplied text-on-background colours
 *
 * @module visual
 */

/* ── Colour maths (WCAG 2.x) ───────────────────────────────────────── */

/** "#3B2A20" | "3B2A20" → [r, g, b] (0-255). Returns null if unparsable. */
export function hexToRgb(hex) {
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]) {
  const cl = (n) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[cl(r), cl(g), cl(b)].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** WCAG relative luminance of an sRGB triple. */
export function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1 = identical, 21 = black/white). */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Perceptually-weighted RGB distance ("redmean" approximation). Much closer to
 * how humans judge colour difference than plain Euclidean RGB.
 * 0 = identical; >~100 is a clearly different colour to most eyes.
 */
export function colorDistance(a, b) {
  const rmean = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(
    (2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db
  );
}

/** Nearest palette entry to a colour, with the distance. */
export function nearestPaletteColor(rgb, palette) {
  let best = null;
  for (const entry of palette ?? []) {
    const target = hexToRgb(entry.hex);
    if (!target) continue;
    const d = colorDistance(rgb, target);
    if (!best || d < best.distance) best = { name: entry.name, hex: entry.hex, rgb: target, distance: d };
  }
  return best;
}

/* ── The checks ────────────────────────────────────────────────────── */

function finding(partial) {
  return {
    severity: "low",
    confidence: 0.95,
    sourceType: "visual",
    needsHuman: false,
    // Visual findings are self-verifying: they cite a real rule and carry the
    // measured evidence as their "quote". Marking them citationVerified here
    // keeps F5's purpose (gating AI-claimed citations) intact while a
    // deterministic measurement isn't downgraded to needs-human.
    citationVerified: true,
    citationRejectReason: null,
    sourceKind: "visual-measurement",
    ...partial,
  };
}

/** Distance beyond which a dominant colour is considered off-palette. */
const PALETTE_TOLERANCE = 70;
/** How many dominant colours we report on per image. */
const TOP_COLOURS = 4;

/**
 * Run all visual checks.
 *
 * @param {object} visual extracted facts about the image
 * @param {string} [visual.altText] alt text as authored (may be missing)
 * @param {Array<{hex: string, share?: number}>} [visual.dominantColors]
 *        top dominant colours with their share of pixels (0-1)
 * @param {string} [visual.textColor] colour of overlaid text, if any
 * @param {string} [visual.bgColor] background behind that text, if any
 * @param {number} [visual.width], [visual.height] pixel dimensions
 * @param {{rules: Array, palette: Array}} kb
 * @returns {Array} findings (same shape as runChecks)
 */
export function runVisualChecks(visual, { rules = [], palette = [] } = {}) {
  const v = visual ?? {};
  const out = [];
  const rule = (id) => rules.find((r) => r.id === id);

  /* R-A11Y-1 — alt text */
  if (rule("R-A11Y-1")) {
    const alt = typeof v.altText === "string" ? v.altText.trim() : "";
    if (!alt) {
      out.push(
        finding({
          ruleId: "R-A11Y-1",
          severity: "medium",
          confidence: 0.99,
          spanText: "",
          issue: "Image has no alt text. Screen-reader users get nothing.",
          sourceQuote: "Every image needs alt text that describes it (5 to 125 characters, no 'image of').",
          visual: { kind: "alt-text", present: false },
        })
      );
    } else {
      const tooShort = alt.length < 5;
      const tooLong = alt.length > 125;
      const badPrefix = /^(image|photo|picture|graphic)\s+of\b/i.test(alt);
      if (tooShort || tooLong || badPrefix) {
        const why = tooShort
          ? `only ${alt.length} characters (needs 5-125)`
          : tooLong
            ? `${alt.length} characters (needs 5-125)`
            : "starts with 'image of', which screen readers already announce";
        out.push(
          finding({
            ruleId: "R-A11Y-1",
            severity: "medium",
            confidence: 0.98,
            spanText: alt,
            issue: `Alt text is unhelpful: ${why}.`,
            sourceQuote: "Every image needs alt text that describes it (5 to 125 characters, no 'image of').",
            visual: { kind: "alt-text", present: true, length: alt.length, problem: tooShort ? "short" : tooLong ? "long" : "prefix" },
          })
        );
      }
    }
  }

  /* R-A11Y-3 — contrast of supplied text colours */
  if (rule("R-A11Y-3") && v.textColor && v.bgColor) {
    const fg = hexToRgb(v.textColor);
    const bg = hexToRgb(v.bgColor);
    if (fg && bg) {
      const ratio = contrastRatio(fg, bg);
      if (ratio < 4.5) {
        out.push(
          finding({
            ruleId: "R-A11Y-3",
            severity: "medium",
            confidence: 0.97,
            spanText: `${v.textColor} on ${v.bgColor}`,
            issue: `Text/background contrast is ${ratio.toFixed(2)}:1, below the 4.5:1 minimum.`,
            sourceQuote: "Text and background contrast at least 4.5:1.",
            visual: { kind: "contrast", ratio: Math.round(ratio * 100) / 100, textColor: v.textColor, bgColor: v.bgColor },
          })
        );
      }
    }
  }

  /* R-VIS-1 — dominant colours vs palette (heuristic ⇒ lower confidence) */
  if (rule("R-VIS-1") && Array.isArray(v.dominantColors) && palette.length) {
    const offPalette = [];
    for (const entry of v.dominantColors.slice(0, TOP_COLOURS)) {
      const rgb = typeof entry === "string" ? hexToRgb(entry) : hexToRgb(entry?.hex);
      if (!rgb) continue;
      const near = nearestPaletteColor(rgb, palette);
      // Ignore near-blacks/whites/greys — they read as neutral, not brand
      // violations, and flagging them would cry wolf on every photo.
      if (isNeutral(rgb)) continue;
      if (near && near.distance > PALETTE_TOLERANCE) {
        offPalette.push({
          hex: rgbToHex(rgb),
          share: entry?.share ?? null,
          nearest: near.name,
          nearestHex: near.hex,
          distance: Math.round(near.distance),
        });
      }
    }
    if (offPalette.length) {
      const worst = offPalette.reduce((a, b) => (b.distance > a.distance ? b : a));
      out.push(
        finding({
          ruleId: "R-VIS-1",
          severity: "low",
          // Colour extraction is heuristic, and only a minority of the image is
          // off-palette — so we report lower confidence and let a human judge.
          confidence: 0.62,
          spanText: offPalette.map((c) => c.hex).join(", "),
          issue: `${offPalette.length} dominant colour(s) fall outside the brand palette — nearest approved is ${worst.nearest} (${worst.nearestHex}).`,
          sourceQuote: "Use only the brand palette in images and graphics.",
          visual: { kind: "palette", offPalette, tolerance: PALETTE_TOLERANCE },
        })
      );
    }
  }

  return out;
}

/** True for colours that read as neutral (near-black, near-white, or grey). */
function isNeutral([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 40 || min > 225) return true; // near-black / near-white
  return max - min < 26; // low saturation ⇒ grey-ish
}

/**
 * Merge visual findings into text findings for a single review result.
 * Kept here (not in index.js) so the visual module owns its own integration.
 */
export function mergeVisual(findings, visualFindings) {
  return [...findings, ...visualFindings];
}
