/**
 * BrandGuard Design System — Design Tokens
 *
 * Central source of truth for colors, spacing, typography, shadows, and animations.
 * Import from here instead of hardcoding values in components.
 */

/* ── Colors ── */
export const colors = {
  /* Brand primary */
  brand: {
    50: "#eef2ff",
    100: "#e0e7ff",
    200: "#c7d2fe",
    300: "#a5b4fc",
    400: "#818cf8",
    500: "#6366f1",
    600: "#4f46e5",
    700: "#4338ca",
    800: "#3730a3",
    900: "#312e81",
    950: "#1e1b4b",
  },

  /* Accent — cyan for scanning/detection vibes */
  accent: {
    50: "#ecfeff",
    100: "#cffafe",
    200: "#a5f3fc",
    300: "#67e8f9",
    400: "#22d3ee",
    500: "#06b6d4",
    600: "#0891b2",
    700: "#0e7490",
    800: "#155e75",
    900: "#164e63",
  },

  /* Danger — for problem/threat sections */
  danger: {
    400: "#f87171",
    500: "#ef4444",
    600: "#dc2626",
  },

  /* Success — for trust/check indicators */
  success: {
    400: "#4ade80",
    500: "#22c55e",
    600: "#16a34a",
  },

  /* Neutrals — slate-based dark theme */
  neutral: {
    50: "#f8fafc",
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#94a3b8",
    500: "#64748b",
    600: "#475569",
    700: "#334155",
    800: "#1e293b",
    900: "#0f172a",
    950: "#020617",
  },

  /* Surfaces */
  surface: {
    base: "#020617",
    raised: "rgba(255, 255, 255, 0.02)",
    hover: "rgba(255, 255, 255, 0.04)",
    overlay: "rgba(2, 6, 23, 0.7)",
    glass: "rgba(2, 6, 23, 0.70)",
  },

  /* Borders */
  border: {
    subtle: "rgba(255, 255, 255, 0.05)",
    default: "rgba(255, 255, 255, 0.10)",
    strong: "rgba(255, 255, 255, 0.20)",
    brand: "rgba(99, 102, 241, 0.20)",
    brandStrong: "rgba(99, 102, 241, 0.30)",
  },
} as const;

/* ── Typography ── */
export const typography = {
  size: {
    xs: "0.75rem",    // 12px
    sm: "0.875rem",   // 14px
    base: "1rem",     // 16px
    lg: "1.125rem",   // 18px
    xl: "1.25rem",    // 20px
    "2xl": "1.5rem",  // 24px
    "3xl": "1.875rem",// 30px
    "4xl": "2.25rem", // 36px
    "5xl": "3rem",    // 48px
    "6xl": "3.75rem", // 60px
    "7xl": "4.5rem",  // 72px
  },
  weight: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
  leading: {
    tight: "1.1",
    snug: "1.25",
    normal: "1.5",
    relaxed: "1.625",
    loose: "1.75",
  },
  tracking: {
    tighter: "-0.05em",
    tight: "-0.025em",
    normal: "0",
    wide: "0.025em",
    wider: "0.05em",
    widest: "0.1em",
  },
} as const;

/* ── Spacing ── */
export const spacing = {
  section: {
    y: "8rem",     // py-32
    x: "1.5rem",   // px-6
  },
  container: "80rem", // max-w-7xl
  gap: {
    xs: "0.5rem",
    sm: "0.75rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
    "2xl": "3rem",
  },
} as const;

/* ── Border Radius ── */
export const radius = {
  sm: "0.5rem",
  md: "0.75rem",
  lg: "1rem",
  xl: "1.25rem",
  "2xl": "1.5rem",
  "3xl": "1.5rem",
  full: "9999px",
  card: "1.5rem",
  button: "9999px",
} as const;

/* ── Shadows ── */
export const shadows = {
  glow: {
    brand: "0 0 60px -12px rgba(99, 102, 241, 0.25)",
    brandStrong: "0 0 80px -12px rgba(99, 102, 241, 0.4)",
    accent: "0 0 60px -12px rgba(34, 211, 238, 0.25)",
    danger: "0 0 60px -12px rgba(239, 68, 68, 0.20)",
  },
  card: "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.3)",
  cardHover: "0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
} as const;

/* ── Gradients ── */
export const gradients = {
  brandText: "linear-gradient(to right, #818cf8, #a78bfa, #22d3ee)",
  brandBg: "linear-gradient(to bottom right, rgba(99, 102, 241, 0.10), rgba(168, 85, 247, 0.10), rgba(34, 211, 238, 0.10))",
  sectionAccent: "linear-gradient(to bottom, rgba(99, 102, 241, 0.03), transparent, transparent)",
  heroDark: "linear-gradient(to bottom, rgba(2, 6, 23, 0.5), transparent, #020617)",
} as const;

/* ── Framer Motion presets ── */
export const motion = {
  fadeUp: {
    hidden: { opacity: 0, y: 40 },
    visible: (i: number = 0) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.1, duration: 0.6, ease: "easeOut" },
    }),
  },
  fadeIn: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: 0.6, ease: "easeOut" },
    },
  },
  scaleIn: {
    hidden: { opacity: 0, scale: 0.9 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { duration: 0.8 },
    },
  },
  stagger: {
    visible: { transition: { staggerChildren: 0.12 } },
  },
} as const;

/* ── Breakpoints (match Tailwind) ── */
export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const;

/* ── Z-index scale ── */
export const zIndex = {
  base: 0,
  content: 10,
  overlay: 20,
  sticky: 30,
  navbar: 50,
  modal: 100,
} as const;
