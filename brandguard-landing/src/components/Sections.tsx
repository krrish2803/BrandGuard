"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ScanSearch,
  Shield,
  FileText,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ShieldCheck,
  Clock,
  Target,
  RotateCcw,
  UserCheck,
  Cpu,
  BookOpen,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";

/* ── Animation variants ── */
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" as const },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

/* ── Animated counter hook ── */
function useCountUp(target: number, duration = 2000, startOnView = true) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(!startOnView);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!startOnView) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          obs.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [startOnView]);

  useEffect(() => {
    if (!started) return;
    const steps = 50;
    const increment = target / steps;
    let current = 0;
    const interval = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(interval);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(interval);
  }, [started, target, duration]);

  return { count, ref };
}

export const getDashboardUrl = () => {
  if (process.env.NEXT_PUBLIC_DASHBOARD_URL) return process.env.NEXT_PUBLIC_DASHBOARD_URL;
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:4000/#/dashboard`;
  }
  return "http://localhost:4000/#/dashboard";
};

/* ═══════════════════════════════════════
   HERO CONTENT
   ═══════════════════════════════════════ */
export function HeroContent() {
  return (
    <div className="relative z-10 text-center max-w-4xl mx-auto pt-8 pb-12">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-8 backdrop-blur-md">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span className="text-xs sm:text-sm text-indigo-300 font-medium tracking-wide">
            Pre-Publication Brand Governance Platform • Codex 48
          </span>
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15 }}
        className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight mb-6 leading-[1.1]"
      >
        <span className="text-white">Brand Governance That </span>
        <br />
        <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-cyan-400 bg-clip-text text-transparent">
          Explains, Suggests & Keeps
        </span>
        <br />
        <span className="text-white">Humans in Control</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3 }}
        className="text-base sm:text-lg md:text-xl text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed font-normal"
      >
        Others check content against a static PDF. <strong>BrandGuard</strong> keeps approved facts alive, tests the guidelines themselves, and only suggests fixes it has already verified.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.45 }}
        className="flex flex-col sm:flex-row items-center justify-center gap-4"
      >
        <a
          href={getDashboardUrl()}
          className="w-full sm:w-auto px-8 py-4 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-base transition-all hover:shadow-lg hover:shadow-indigo-500/30 flex items-center justify-center gap-2"
        >
          Try Interactive Demo
          <ArrowRight className="w-4 h-4" />
        </a>
        <a
          href="#how-it-works"
          className="w-full sm:w-auto px-8 py-4 rounded-full border border-white/10 text-slate-300 hover:text-white hover:border-white/30 font-medium transition-all hover:bg-white/[0.04] text-base"
        >
          Explore How It Works
        </a>
      </motion.div>

      {/* Trust bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7, duration: 0.8 }}
        className="mt-14 flex flex-wrap justify-center items-center gap-6 sm:gap-10 text-slate-400 text-xs sm:text-sm"
      >
        <span className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Grounded Citations (No AI Guessing)
        </span>
        <span className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Verified-Then-Suggest Loop
        </span>
        <span className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Living Facts & Reverse Alerts
        </span>
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════
   STATS SECTION
   ═══════════════════════════════════════ */
export function StatsSection() {
  const stat1 = useCountUp(100, 1500);
  const stat2 = useCountUp(0, 1000);
  const stat3 = useCountUp(94, 1800);
  const stat4 = useCountUp(100, 1200);

  const stats = [
    {
      ref: stat1.ref,
      value: `${stat1.count}%`,
      label: "Grounded Citations Required",
      desc: "Every finding links to a real rule or fact ID",
      icon: <CheckCircle2 className="w-5 h-5" />,
      color: "text-indigo-400",
      bgColor: "bg-indigo-500/10",
    },
    {
      ref: stat2.ref,
      value: `${stat2.count}`,
      label: "Hallucinated Rules Allowed",
      desc: "Zero-tolerance citation validator",
      icon: <ShieldCheck className="w-5 h-5" />,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
    },
    {
      ref: stat3.ref,
      value: `${stat3.count}%`,
      label: "Avg. Intent Preserved",
      desc: "Measured before any rewrite is proposed",
      icon: <Target className="w-5 h-5" />,
      color: "text-cyan-400",
      bgColor: "bg-cyan-500/10",
    },
    {
      ref: stat4.ref,
      value: `${stat4.count}%`,
      label: "Human Decision Control",
      desc: "Nothing applied without a human click",
      icon: <UserCheck className="w-5 h-5" />,
      color: "text-purple-400",
      bgColor: "bg-purple-500/10",
    },
  ];

  return (
    <section className="py-16 px-6 relative">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={stagger}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6"
        >
          {stats.map((s, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              custom={i}
              ref={s.ref}
              className="text-center p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all"
            >
              <div
                className={`w-10 h-10 rounded-xl ${s.bgColor} flex items-center justify-center ${s.color} mx-auto mb-3`}
              >
                {s.icon}
              </div>
              <div className={`text-3xl md:text-4xl font-bold ${s.color} mb-1 font-mono`}>
                {s.value}
              </div>
              <div className="text-white font-medium text-sm mb-1">{s.label}</div>
              <div className="text-slate-500 text-xs">{s.desc}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════
   PROBLEM SECTION
   ═══════════════════════════════════════ */
export function ProblemSection() {
  const rootCauses = [
    {
      icon: <Clock className="w-6 h-6" />,
      title: "Facts Expire Silently",
      desc: "An offer ends, pricing changes, or shipping rules update—yet drafts and scheduled posts still carry the stale version. Nobody notices until a customer complains.",
      tag: "Root Cause 1",
    },
    {
      icon: <AlertTriangle className="w-6 h-6" />,
      title: "Guidelines Are Ambiguous",
      desc: "Rules like 'friendly yet professional' are interpreted differently by every creator and agency. When a rule is broken constantly, no existing tool identifies that the rule itself is the problem.",
      tag: "Root Cause 2",
    },
    {
      icon: <RotateCcw className="w-6 h-6" />,
      title: "Rejection Without Help",
      desc: "Current compliance checks simply say 'NO' and reject drafts. They fail to understand what the creator was actually trying to communicate, creating frustrating review bottlenecks.",
      tag: "Root Cause 3",
    },
  ];

  const personas = [
    {
      role: "Creator & Agency",
      pain: "Doesn't know every obscure rule, gets vague rejections, and undergoes repeated rework rounds.",
    },
    {
      role: "Brand Manager",
      pain: "Becomes the manual bottleneck, reviews hundreds of items by hand, and still misses subtle errors.",
    },
    {
      role: "Legal / Reviewer",
      pain: "Flooded with low-risk items and cannot focus their limited time on high-stakes regulated claims.",
    },
    {
      role: "Admin & Enterprise",
      pain: "No centralized, versioned source of truth for guidelines, living facts, and AI usage audit logs.",
    },
  ];

  return (
    <section id="problem" className="py-28 px-6 relative">
      <div className="max-w-7xl mx-auto relative z-10">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
          className="text-center mb-16"
        >
          <motion.div variants={fadeUp} custom={0}>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 font-semibold text-xs uppercase tracking-widest">
              <AlertTriangle className="w-3.5 h-3.5" /> The Problem We Solve
            </span>
          </motion.div>
          <motion.h2
            variants={fadeUp}
            custom={1}
            className="text-3xl sm:text-5xl font-bold text-white mt-6"
          >
            Why Brand Guidelines Fail in the AI Era
          </motion.h2>
          <motion.p
            variants={fadeUp}
            custom={2}
            className="text-slate-400 mt-4 max-w-2xl mx-auto text-base sm:text-lg"
          >
            Organizations publish content through dozens of employees, agencies, freelancers, and AI tools. Rules buried in 50-page PDF brand books never get applied consistently.
          </motion.p>
        </motion.div>

        {/* 3 Root Causes */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
          className="grid md:grid-cols-3 gap-6 mb-16"
        >
          {rootCauses.map((rc, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              custom={i}
              className="p-8 rounded-2xl bg-gradient-to-b from-red-500/[0.04] to-transparent border border-red-500/10 hover:border-red-500/25 transition-all group"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400">
                  {rc.icon}
                </div>
                <span className="text-[11px] font-mono text-red-400/70 uppercase tracking-wider px-2 py-1 rounded bg-red-500/5 border border-red-500/10">
                  {rc.tag}
                </span>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">{rc.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{rc.desc}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Impacted Personas */}
        <div className="p-8 rounded-3xl bg-slate-950/60 border border-white/5">
          <h4 className="text-base font-semibold text-white mb-6 text-center">
            Who Suffers When Governance Is Manual:
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {personas.map((p, i) => (
              <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <span className="text-xs font-semibold text-indigo-400 block mb-1">
                  {p.role}
                </span>
                <p className="text-xs text-slate-400 leading-relaxed">{p.pain}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════
   SOLUTION PILLARS
   ═══════════════════════════════════════ */
export function SolutionSection() {
  const pillars = [
    {
      icon: <ShieldCheck className="w-6 h-6" />,
      title: "Citation or Human",
      desc: "Every flagged finding cites a real rule ID or approved fact ID. If no source exists in the database, BrandGuard says 'human decision needed' instead of guessing.",
      gradient: "from-indigo-500 to-blue-500",
      accent: "text-indigo-400",
    },
    {
      icon: <RotateCcw className="w-6 h-6" />,
      title: "Living Facts & Reverse Alerts",
      desc: "Approved facts have owners and expiry dates. When an offer or price changes, BrandGuard immediately scans every existing draft and scheduled post, alerting the owner.",
      gradient: "from-amber-500 to-orange-500",
      accent: "text-amber-400",
    },
    {
      icon: <Sparkles className="w-6 h-6" />,
      title: "Verified Suggestions",
      desc: "Extracts the creator's true intent, then re-runs the full checker catalog on candidate fixes. Only fixes that produce zero new violations and score >70% intent are shown.",
      gradient: "from-purple-500 to-pink-500",
      accent: "text-purple-400",
    },
    {
      icon: <Cpu className="w-6 h-6" />,
      title: "Prevention at the Source",
      desc: "A developer REST API and MCP server allow AI writing agents (Claude, ChatGPT, internal bots) to fetch brand guidelines before writing and self-check afterwards.",
      gradient: "from-cyan-500 to-emerald-500",
      accent: "text-cyan-400",
    },
  ];

  return (
    <section id="solution" className="py-28 px-6 relative">
      <div className="max-w-7xl mx-auto relative z-10">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
          className="text-center mb-16"
        >
          <motion.div variants={fadeUp} custom={0}>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-semibold text-xs uppercase tracking-widest">
              <ShieldCheck className="w-3.5 h-3.5" /> What Makes BrandGuard Different
            </span>
          </motion.div>
          <motion.h2
            variants={fadeUp}
            custom={1}
            className="text-3xl sm:text-5xl font-bold text-white mt-6"
          >
            The Four Pillars of Explainable Governance
          </motion.h2>
          <motion.p
            variants={fadeUp}
            custom={2}
            className="text-slate-400 mt-4 max-w-2xl mx-auto text-base sm:text-lg"
          >
            Built from first principles to ensure AI never hallucinates policy, never breaks secondary rules with bad rewrites, and keeps humans in total decision control.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
          className="grid md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {pillars.map((p, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              custom={i}
              className="relative p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-indigo-500/30 transition-all group flex flex-col justify-between"
            >
              <div>
                <div
                  className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center ${p.accent} mb-6 group-hover:scale-105 transition-transform`}
                >
                  {p.icon}
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{p.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">{p.desc}</p>
              </div>
              <div
                className={`h-1 w-12 rounded bg-gradient-to-r ${p.gradient} group-hover:w-full transition-all duration-300`}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════
   COMPARISON SECTION (TYPICAL VS BRANDGUARD)
   ═══════════════════════════════════════ */
export function ComparisonSection() {
  const comparisons = [
    {
      typical: "Checks only new content against a static PDF document.",
      brandguard:
        "Fact expiry with reverse alerts: approved facts have owners and expiry dates. When an offer or price changes, every draft and scheduled item is found and flagged.",
    },
    {
      typical: "Counts how often rules are broken and blames the content creator.",
      brandguard:
        "Guideline testing and clarity scores: dispute-rate tracking flags ambiguous rules (e.g. clarity under 70%) for human rewording.",
    },
    {
      typical: "Suggests a rewrite that often breaks another brand rule.",
      brandguard:
        "Verified suggestions: extracts intent, re-runs the full checker catalog on candidate fixes, and presents only those with >70% intent preserved.",
    },
    {
      typical: "Catches problems at the very end of the production cycle.",
      brandguard:
        "Prevention at source: MCP server and REST API allow AI agents and writing tools to fetch rules before writing and self-check afterwards.",
    },
  ];

  return (
    <section className="py-24 px-6 relative">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs uppercase tracking-widest text-cyan-400 font-semibold px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20">
            Head-to-Head Comparison
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mt-4">
            Traditional Brand Checking vs. BrandGuard
          </h2>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/60 overflow-hidden shadow-xl">
          <div className="grid grid-cols-1 md:grid-cols-2 border-b border-white/10 bg-slate-900/80 text-xs font-bold uppercase tracking-wider">
            <div className="p-4 sm:p-5 text-slate-400 border-b md:border-b-0 md:border-r border-white/10">
              Typical Approach (Static PDF Checker)
            </div>
            <div className="p-4 sm:p-5 text-indigo-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              BrandGuard (Living Governance Engine)
            </div>
          </div>

          <div className="divide-y divide-white/5">
            {comparisons.map((c, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-2 text-sm">
                <div className="p-5 sm:p-6 text-slate-400 bg-white/[0.01] border-b md:border-b-0 md:border-r border-white/5 flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center shrink-0 mt-0.5 text-xs">
                    ✕
                  </span>
                  <span className="leading-relaxed">{c.typical}</span>
                </div>
                <div className="p-5 sm:p-6 text-slate-200 bg-indigo-500/[0.02] flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-medium">{c.brandguard}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════
   FEATURES SECTION
   ═══════════════════════════════════════ */
export function FeaturesSection() {
  const features = [
    {
      icon: <FileText className="w-6 h-6" />,
      title: "Deterministic Code Checks",
      desc: "Plain code handles glossary matching, brand name casing, exclamation limits, slang lexicons, and WCAG 4.5:1 contrast ratios without AI opinion.",
      color: "text-indigo-400",
    },
    {
      icon: <ShieldCheck className="w-6 h-6" />,
      title: "Citation Validator Centerpiece",
      desc: "LLM findings must match a valid rule or fact ID in the database. Any unsupported finding is immediately downgraded to 'needs human decision'.",
      color: "text-emerald-400",
    },
    {
      icon: <Sparkles className="w-6 h-6" />,
      title: "Verify-Then-Suggest Loop",
      desc: "Generates candidate fixes, re-runs all deterministic checks on the replacement, and scores semantic similarity to retain the author's voice.",
      color: "text-purple-400",
    },
    {
      icon: <RotateCcw className="w-6 h-6" />,
      title: "Fact Expiry & Reverse Alerts",
      desc: "Live links to operational facts. Changing a discount or moving time forward rescans all scheduled content and notifies owners in seconds.",
      color: "text-amber-400",
    },
    {
      icon: <UserCheck className="w-6 h-6" />,
      title: "Role Routing & Approvals",
      desc: "Auto-routes low-risk copy to Managers; reserves high-risk claims, competitor mentions, and health claims exclusively for authorized Reviewers.",
      color: "text-cyan-400",
    },
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: "Clarity Scoring & Audit Receipts",
      desc: "Measures guideline dispute rates to pinpoint ambiguous rules, and creates cryptographic, downloadable approval receipts for compliance.",
      color: "text-rose-400",
    },
  ];

  return (
    <section id="features" className="py-28 px-6 relative">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-semibold text-xs uppercase tracking-widest">
            <Sparkles className="w-3 h-3" /> Core Engineering Features
          </span>
          <h2 className="text-3xl sm:text-5xl font-bold text-white mt-6">
            Engineered for Precision & Accountability
          </h2>
          <p className="text-slate-400 mt-4 max-w-2xl mx-auto text-base sm:text-lg">
            Every feature aligns strictly with the committed Round 2 MVP specification to deliver explainable, reliable brand governance.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div
              key={i}
              className="p-7 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/15 transition-all group"
            >
              <div className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center ${f.color} mb-5 group-hover:scale-110 transition-transform`}>
                {f.icon}
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{f.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════
   HOW IT WORKS
   ═══════════════════════════════════════ */
export function HowItWorksSection() {
  const steps = [
    {
      num: "01",
      title: "Setup Knowledge Base",
      desc: "Admin configures brand guidelines, approved facts with owner/expiry, approved glossary terms, and brand asset palettes.",
      icon: <BookOpen className="w-5 h-5" />,
    },
    {
      num: "02",
      title: "Intake & Code Inspection",
      desc: "Content is submitted via web UI, developer REST API, or MCP agent plugin. Deterministic code scans run first in milliseconds.",
      icon: <ScanSearch className="w-5 h-5" />,
    },
    {
      num: "03",
      title: "Grounded LLM Judgment & Validation",
      desc: "Retrieved rules and unexpired facts provide the only context for tone and claim review. The Citation Validator rejects any ungrounded findings.",
      icon: <Cpu className="w-5 h-5" />,
    },
    {
      num: "04",
      title: "Verified Fixes & Human Decisions",
      desc: "The creator sees 1 to 2 verified rewrites with intent retention scores. The creator chooses to accept, edit, or dispute with reason.",
      icon: <Sparkles className="w-5 h-5" />,
    },
    {
      num: "05",
      title: "Role-Based Approval & Reverse Alerts",
      desc: "Routed to Manager or Reviewer. Approvals issue immutable receipts. If a fact later expires, BrandGuard automatically alerts the owner.",
      icon: <RotateCcw className="w-5 h-5" />,
    },
  ];

  return (
    <section id="how-it-works" className="py-28 px-6 relative">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs uppercase tracking-widest text-purple-400 font-semibold px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20">
            End-to-End Workflow
          </span>
          <h2 className="text-3xl sm:text-5xl font-bold text-white mt-6">
            Five Steps to Verified Brand Safety
          </h2>
        </div>

        <div className="space-y-6">
          {steps.map((s, i) => (
            <div
              key={i}
              className="flex gap-5 sm:gap-6 p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all items-start"
            >
              <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-mono font-bold shrink-0 text-base">
                {s.num}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-indigo-400">{s.icon}</span>
                  <h3 className="text-lg font-bold text-white">{s.title}</h3>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════
   CTA SECTION
   ═══════════════════════════════════════ */
export function CTASection() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubmitted(true);
    }
  };

  return (
    <section id="cta" className="py-28 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <div className="relative p-10 sm:p-16 rounded-3xl border border-white/10 bg-gradient-to-b from-indigo-950/40 via-slate-900 to-slate-950 overflow-hidden shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-6 text-indigo-400">
            <Shield className="w-7 h-7" />
          </div>

          <h2 className="text-3xl sm:text-5xl font-bold text-white mb-4">
            Protect Brand Trust Before You Publish
          </h2>
          <p className="text-slate-300 text-base sm:text-lg max-w-xl mx-auto mb-8">
            Experience pre-publication brand governance that eliminates hallucinations, preserves author intent, and keeps living facts synchronized.
          </p>

          {submitted ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 max-w-md mx-auto text-sm flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>Thank you! Your demo access token has been queued.</span>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter work email..."
                className="flex-1 px-5 py-3.5 rounded-full bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
              />
              <button
                type="submit"
                className="px-6 py-3.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all hover:shadow-lg hover:shadow-indigo-500/25 whitespace-nowrap"
              >
                Request Pilot Access
              </button>
            </form>
          )}

          <p className="text-slate-500 text-xs mt-5">
            Codex 48 Hackathon Build • Fictional Demo Brand: Brewloom • Zero Sign-Up Required
          </p>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════
   FAQ SECTION
   ═══════════════════════════════════════ */
export function FAQSection() {
  const faqs = [
    {
      q: "How does BrandGuard guarantee zero hallucinated guidelines?",
      a: "Our Citation Validator forces all LLM evaluations into a structured schema that requires a verified ruleId or factId from the database. Any finding lacking a valid database match or exact text span is rejected and flagged as 'needs human decision'.",
    },
    {
      q: "What is a 'Reverse Alert' and how does it prevent outdated claims?",
      a: "Approved promotional facts (e.g. '20% off with WELCOME20' or 'Delivery in 2 days') carry expiration dates and owners. When a fact is updated or expires, BrandGuard automatically rescans all scheduled drafts and alerts the owner with the required replacement text.",
    },
    {
      q: "How does the 'Verified Suggestion' loop preserve the creator's voice?",
      a: "Instead of raw LLM rewrites, BrandGuard extracts the creator's intent, generates candidate fixes, re-runs the full 15-rule deterministic check on the candidate to verify it doesn't break another rule, and calculates semantic word overlap (intent kept score). Only fixes passing this gauntlet are displayed.",
    },
    {
      q: "How does the platform handle AI provider outages or rate limits?",
      a: "BrandGuard operates with graceful degradation. If Gemini or NVIDIA keys fail or exceed rate limits, the entire deterministic code engine (glossary matching, brand spelling, sentence length, superlatives, contrast, and expiry checks) continues running flawlessly without interruption.",
    },
    {
      q: "Can AI writing agents integrate directly with BrandGuard?",
      a: "Yes. BrandGuard exposes public REST endpoints (`/api/agent/check` and `/api/agent/context`) and an MCP server allowing agents like Claude or custom LLM bots to fetch guidelines before drafting and validate copy prior to review submission.",
    },
  ];

  return (
    <section id="faq" className="py-24 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs uppercase tracking-widest text-emerald-400 font-semibold px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            Frequently Asked Questions
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mt-4">
            Understanding BrandGuard Governance
          </h2>
        </div>

        <div className="space-y-4">
          {faqs.map((f, i) => (
            <FAQItem key={i} q={f.q} a={f.a} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/10 rounded-2xl overflow-hidden bg-white/[0.02] hover:bg-white/[0.04] transition-all">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-5 text-left cursor-pointer"
      >
        <span className="text-white font-medium text-sm sm:text-base pr-4">{q}</span>
        <ChevronDown
          className={`w-5 h-5 text-slate-400 transition-transform ${open ? "rotate-180 text-indigo-400" : ""}`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-5 text-slate-400 text-sm leading-relaxed border-t border-white/5 pt-3">
              {a}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════ */
export function Footer() {
  return (
    <footer className="border-t border-white/5 py-12 px-6 bg-slate-950">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <span className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              BrandGuard
            </span>
            <p className="text-xs text-slate-500">Intelligent Brand Governance • Codex 48</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
          <a href="#interactive-demo" className="hover:text-white transition-colors">
            Interactive Demo
          </a>
          <a href="#problem" className="hover:text-white transition-colors">
            Problem Statement
          </a>
          <a href="#solution" className="hover:text-white transition-colors">
            Core Differentiators
          </a>
          <a href="#features" className="hover:text-white transition-colors">
            Feature Spec
          </a>
          <a href="#faq" className="hover:text-white transition-colors">
            FAQ
          </a>
        </div>

        <div className="text-right text-xs text-slate-500">
          <div>Built by <strong>Krrish Yaduka</strong> (Solo Builder)</div>
          <div>Adamas University • Inkloom AI Challenge</div>
        </div>
      </div>
    </footer>
  );
}
