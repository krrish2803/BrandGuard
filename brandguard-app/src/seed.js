/**
 * Brewloom seed data — Round 2 Build Spec, Section 9.
 *
 * Pure data, no side effects. The engine takes rules/facts as inputs so tests
 * can inject fabricated data (e.g. a fake ruleId for the F5 citation validator).
 */

export const demoBrand = "Brewloom";

/** Guideline rules (F1). severity drives routing: high → Reviewer. */
export const rules = [
  {
    id: "R-TONE-1",
    category: "Tone",
    severity: "low",
    text: "Warm and calm. At most one exclamation mark per piece. No ALL-CAPS words for emphasis.",
  },
  {
    id: "R-TONE-2",
    category: "Tone",
    severity: "low",
    text: "No slang or text-speak (OMG, lol, gonna, wanna, u).",
  },
  {
    id: "R-TONE-3",
    category: "Tone",
    severity: "low",
    text: "Plain language. Avoid jargon (synergy, leverage, game-changing, revolutionary). Keep sentences under 25 words.",
  },
  {
    id: "R-TERM-1",
    category: "Terms",
    severity: "medium",
    text: "Say 'guests', never 'customers', 'users' or 'clients'.",
  },
  {
    id: "R-TERM-2",
    category: "Terms",
    severity: "medium",
    text: "Brand name is written 'Brewloom' (one word, capital B only).",
  },
  {
    id: "R-TERM-3",
    category: "Terms",
    severity: "low",
    text: "Say 'affordable', never 'cheap'.",
  },
  {
    id: "R-CLAIM-1",
    category: "Claims",
    severity: "high",
    text: "Superlatives and absolutes (best, fastest, #1, guaranteed, 100%) are allowed only when an approved claim supports them.",
  },
  {
    id: "R-CLAIM-2",
    category: "Claims",
    severity: "high",
    text: "No health claims (boosts immunity, detox, weight loss, cures). Needs legal review.",
  },
  {
    id: "R-MSG-1",
    category: "Messaging",
    severity: "high",
    text: "Never compare Brewloom to a named competitor.",
  },
  {
    id: "R-FACT-1",
    category: "Facts",
    severity: "high",
    text: "Offers, prices, delivery promises and city counts must match the approved fact and be within its validity dates.",
  },
  {
    id: "R-A11Y-1",
    category: "Accessibility",
    severity: "medium",
    text: "Every image needs alt text that describes it (5 to 125 characters, no 'image of').",
  },
  {
    id: "R-A11Y-2",
    category: "Accessibility",
    severity: "low",
    text: "Link text must be descriptive. Never 'click here'.",
  },
  {
    id: "R-A11Y-3",
    category: "Accessibility",
    severity: "medium",
    text: "Text and background contrast at least 4.5:1.",
  },
  {
    id: "R-VIS-1",
    category: "Visuals",
    severity: "low",
    text: "Use only the brand palette in images and graphics.",
  },
];

/**
 * Approved facts and claims (F1).
 * `detect` drives both pre-publication checks (F3) and reverse scans (F12).
 * Dates are ISO strings; `validUntil` in the past ⇒ expired as of `asOf`.
 */
export const facts = [
  {
    id: "F-OFFER",
    kind: "fact",
    statement: "20% off your first order with code WELCOME20",
    approved: 20,
    code: "WELCOME20",
    validUntil: "2026-12-31",
    owner: "Marketing",
    detect: { type: "percent" },
  },
  {
    id: "F-DEL",
    kind: "fact",
    statement: "Delivery in 2 days across 120+ cities",
    approved: 2,
    validUntil: "2026-12-31",
    owner: "Operations",
    detect: { type: "days" },
  },
  {
    id: "F-CITIES",
    kind: "fact",
    statement: "We deliver to 120+ cities",
    approved: 120,
    validUntil: "2026-12-31",
    owner: "Operations",
    detect: { type: "cities" },
  },
  {
    id: "F-SHIP",
    kind: "fact",
    statement: "Free delivery on orders above Rs 499",
    approved: 499,
    validUntil: "2026-12-31",
    owner: "Operations",
    detect: { type: "freeAbove" },
  },
  {
    id: "F-SALE",
    kind: "fact",
    statement: "Monsoon Sale: 30% off sitewide",
    approved: 30,
    validUntil: "2026-09-30", // expired — the expiry demo
    owner: "Marketing",
    detect: { type: "percent", requiresPhrase: /monsoon\s+sale/i },
  },
  {
    id: "C-ROAST",
    kind: "claim",
    statement: "Beans are roasted fresh every week in Kolkata",
    approved: null,
    validUntil: "2026-12-31",
    owner: "Brand",
    supports: ["freshest", "fresh roasted"],
    detect: { type: "claim", pattern: /fresh(?:ly)?\s+roast|roasted\s+fresh/i },
  },
  {
    id: "C-SPEED",
    kind: "claim",
    statement: "Delivery in 2 days across 120+ cities",
    approved: null,
    validUntil: "2026-12-31",
    owner: "Operations",
    supports: ["fastest", "quickest"],
    detect: { type: "claim", pattern: /fastest|quickest\s+delivery/i },
  },
];

export const glossary = [
  { preferred: "guests", banned: ["customers", "users", "clients"], ruleId: "R-TERM-1" },
  { preferred: "Brewloom", banned: ["Brew Loom", "BrewLoom", "brewloom", "brew loom"], ruleId: "R-TERM-2" },
  { preferred: "affordable", banned: ["cheap", "cheapest"], ruleId: "R-TERM-3" },
];

export const palette = [
  { name: "espresso", hex: "#3B2A20" },
  { name: "caramel", hex: "#C8963E" },
  { name: "cream", hex: "#F6EFE6" },
  { name: "leaf", hex: "#1F5F4A" },
];

export const competitors = ["Starbucks", "Blue Tokai", "Third Wave Coffee", "Chaayos"];

/** The three example contents and their expected outcomes (spec §9). */
export const examples = [
  {
    id: "example-1",
    title: "Instagram caption (many issues)",
    channel: "Instagram",
    text:
      "OMG our MONSOON SALE is live!!! Get 30% off the BEST coffee in India. " +
      "Cheap prices for all our customers. Click here to order. Brew Loom delivers in 1 day!",
    expected: "Many findings; routed to Reviewer (unsupported claim, expired offer).",
  },
  {
    id: "example-2",
    title: "Welcome email (clean)",
    channel: "Email",
    text:
      "Welcome to Brewloom. Guests get 20% off their first order with code WELCOME20. " +
      "Beans are roasted fresh every week in Kolkata, and delivery takes 2 days across 120+ cities.",
    expected: "No findings; routed to Manager; approvable. Reverse-alert target.",
  },
  {
    id: "example-3",
    title: "Wellness post (reviewer case)",
    channel: "Blog / Social",
    text:
      "Our cold brew boosts immunity and helps you lose weight, and it is better than Starbucks. " +
      "Guaranteed to make you healthier.",
    expected:
      "R-CLAIM-2 health, R-MSG-1 competitor, R-CLAIM-1 'Guaranteed'; Manager cannot approve.",
  },
];

/**
 * Seeded content items (approved/scheduled) so the reverse-alert demo (F12)
 * has live targets. `item-welcome-email` is the spec's reverse-alert demo item.
 */
export const seedItems = [
  {
    id: "item-welcome-email",
    title: "Welcome email",
    channel: "Email",
    text: examples[1].text,
    status: "approved",
    createdBy: "Rahul (Email)",
    scheduledFor: "2026-11-05",
  },
  {
    id: "item-weekend-email",
    title: "Weekend email: Get 20% off your first order",
    channel: "Email",
    text: "A weekend treat for our guests: 20% off your first order with code WELCOME20.",
    status: "scheduled",
    createdBy: "Priya (Social)",
    scheduledFor: "2026-11-01",
  },
  {
    id: "item-banner",
    title: "Website banner: Delivery in 2 days",
    channel: "Website",
    text: "Fast, friendly delivery in 2 days across 120+ cities.",
    status: "scheduled",
    createdBy: "Agency Pixel",
    scheduledFor: "2026-11-03",
  },
];

/** Today's demo date, overridable for deterministic tests. */
export function defaultAsOf(now = new Date()) {
  return now.toISOString().slice(0, 10);
}
