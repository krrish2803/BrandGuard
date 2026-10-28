/**
 * Image decoding for F16 — the impure half.
 *
 * The engine's `src/visual.js` is pure (colours in, findings out). This module
 * does the dirty work it deliberately can't: decode an uploaded PNG/JPEG into
 * raw pixels, then summarise those pixels into the facts the engine consumes
 * (dimensions + dominant colours). Pure JS decoders only — no native deps, so
 * it runs anywhere Node does.
 *
 * We do NOT try to read text off the image (no OCR): guessing which region is
 * "text" without OCR would fabricate a contrast measurement, and the engine's
 * contract is that every number it reports was actually measured. Contrast
 * (R-A11Y-3) therefore only fires when a caller supplies the text/background
 * colours explicitly — which is what a design-token export would do.
 *
 * @module image
 */

import { PNG } from "pngjs";
import { decode as jpegDecode } from "jpeg-js";

/** Hard caps so one upload can't take the process down (F18). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMAGE_PIXELS = 4_000_000; // ~4 MP
export const MAX_DOMINANT = 5;

const MIMES = new Set(["image/png", "image/jpeg", "image/jpg"]);

/**
 * Decode an uploaded image into a plain-RGBA buffer.
 *
 * @param {Buffer} buffer raw file bytes
 * @param {string} [mimeType] as declared by the client
 * @returns {{width: number, height: number, data: Uint8Array}} RGBA, 4 bytes/px
 * @throws {Error} with a `.code` of "unsupported" | "too-large" | "corrupt"
 */
export function decodeImage(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw fail("unsupported", "empty upload");
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw fail("too-large", `image exceeds ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
  }

  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const declaredOk = !mimeType || MIMES.has(mimeType.toLowerCase());

  if (!isPng && !isJpeg) {
    throw fail("unsupported", "only PNG and JPEG are supported");
  }
  if (!declaredOk) {
    throw fail("unsupported", `unsupported content type: ${mimeType}`);
  }

  try {
    if (isPng) {
      const png = PNG.sync.read(buffer);
      guardPixels(png.width, png.height);
      return { width: png.width, height: png.height, data: png.data };
    }
    const jpg = jpegDecode(buffer, { maxMemoryUsageInMB: 256 });
    guardPixels(jpg.width, jpg.height);
    return { width: jpg.width, height: jpg.height, data: jpg.data };
  } catch (e) {
    if (e?.code) throw e; // our own guard errors pass through
    throw fail("corrupt", `could not decode image: ${e.message}`);
  }
}

/**
 * Summarise decoded pixels into the facts the visual engine consumes.
 * Samples every pixel for small images, strides for large ones (the dominant
 * colour of a 4MP photo is the same whether we read 4000 or 40000 pixels).
 *
 * @param {{width: number, height: number, data: Uint8Array}} decoded
 * @returns {{width: number, height: number, dominantColors: Array<{hex: string, share: number}>}}
 */
export function extractFacts({ width, height, data }) {
  // 4 bits per channel ⇒ 4096 buckets. Enough to separate brand colours,
  // coarse enough that JPEG noise doesn't shatter one colour into dozens.
  const buckets = new Map();
  const stride = Math.max(1, Math.floor((width * height) / 120_000));
  let sampled = 0;

  for (let px = 0; px < width * height; px += stride) {
    const i = px * 4;
    const a = data[i + 3];
    if (a < 128) continue; // treat near-transparent pixels as background-less
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
    let bk = buckets.get(key);
    if (!bk) {
      bk = { count: 0, r: 0, g: 0, b: 0 };
      buckets.set(key, bk);
    }
    bk.count += 1;
    bk.r += r;
    bk.g += g;
    bk.b += b;
    sampled += 1;
  }

  if (sampled === 0) {
    return { width, height, dominantColors: [] }; // fully transparent image
  }

  const top = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_DOMINANT)
    .map((bk) => ({
      hex: toHex(bk.r / bk.count, bk.g / bk.count, bk.b / bk.count),
      share: Math.round((bk.count / sampled) * 1000) / 1000,
    }));

  return { width, height, dominantColors: top };
}

/**
 * One-stop intake: bytes → visual facts for `review(opts.visual)`.
 * Alt text is the one thing pixels can't tell us, so it comes from the caller.
 *
 * @param {Buffer} buffer
 * @param {object} [opts]
 * @param {string} [opts.mimeType]
 * @param {string} [opts.altText]   authored alt text (may be absent — that's a finding)
 * @param {string} [opts.textColor] optional: colour of overlaid text
 * @param {string} [opts.bgColor]   optional: background behind that text
 * @returns {{width, height, dominantColors, altText?, textColor?, bgColor?, source: string}}
 */
export function analyseImage(buffer, { mimeType, altText, textColor, bgColor } = {}) {
  const decoded = decodeImage(buffer, mimeType);
  const facts = extractFacts(decoded);
  const visual = { ...facts, source: "upload" };
  if (typeof altText === "string") visual.altText = altText;
  if (typeof textColor === "string" && typeof bgColor === "string") {
    visual.textColor = textColor;
    visual.bgColor = bgColor;
  }
  return visual;
}

/* ── helpers ───────────────────────────────────────────────────────── */

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function guardPixels(w, h) {
  if (!w || !h || w * h > MAX_IMAGE_PIXELS) {
    throw fail("too-large", `image dimensions ${w}×${h} exceed ${MAX_IMAGE_PIXELS} pixels`);
  }
}

function toHex(r, g, b) {
  const cl = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${cl(r)}${cl(g)}${cl(b)}`.toUpperCase();
}

/**
 * A tiny in-memory PNG encoder for tests and fixtures — lets us build a
 * known-colour image and assert the extractor reports it, with no fixture
 * files checked in.
 */
export function encodePng({ width, height, pixels }) {
  const png = new PNG({ width, height });
  png.data = Buffer.from(pixels);
  return PNG.sync.write(png);
}
