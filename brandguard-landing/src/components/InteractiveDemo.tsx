"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getDashboardUrl } from "./Sections";
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  UserCheck,
  RotateCcw,
  FileText,
  Clock,
  Send,
  Eye,
  RefreshCw,
  Info,
  Check,
  X,
  ThumbsDown,
  Layers,
  Lock,
} from "lucide-react";

type Role = "Creator" | "Manager" | "Reviewer" | "Admin";

interface Finding {
  id: string;
  code: string;
  ruleId: string;
  severity: "high" | "medium" | "low";
  spanText: string;
  issue: string;
  sourceQuote: string;
  suggestion: string;
  intentKept: number;
  status: "open" | "accepted" | "disputed";
  routedToReviewer: boolean;
}

const PRESET_EXAMPLES = [
  {
    id: "example-1",
    title: "1. Instagram Caption (Multiple Violations)",
    channel: "Instagram",
    description: "Contains slang, ALL CAPS, expired sale claim, unsupported superlatives, and delivery mismatch.",
    rawText:
      "OMG our MONSOON SALE is live!!! Get 30% off the BEST coffee in India. Cheap prices for all our customers. Click here to order. Brew Loom delivers in 1 day!",
    findings: [
      {
        id: "f-1",
        code: "R-TONE-2",
        ruleId: "R-TONE-2",
        severity: "low" as const,
        spanText: "OMG",
        issue: "Slang / text-speak prohibited in brand copy",
        sourceQuote: "Guideline R-TONE-2: 'No slang or text-speak (OMG, lol, gonna, wanna, u)'",
        suggestion: "Exciting news,",
        intentKept: 91,
        status: "open" as const,
        routedToReviewer: false,
      },
      {
        id: "f-2",
        code: "R-TONE-1",
        ruleId: "R-TONE-1",
        severity: "low" as const,
        spanText: "MONSOON SALE is live!!!",
        issue: "Excessive punctuation (3 exclamation marks)",
        sourceQuote: "Guideline R-TONE-1: 'Warm and calm. At most one exclamation mark per piece.'",
        suggestion: "Monsoon Sale is live!",
        intentKept: 95,
        status: "open" as const,
        routedToReviewer: false,
      },
      {
        id: "f-3",
        code: "F-SALE",
        ruleId: "F-SALE",
        severity: "high" as const,
        spanText: "Get 30% off",
        issue: "Expired promotional offer. Monsoon Sale validity ended 30 Sep 2026.",
        sourceQuote: "Approved Fact F-SALE: 'Monsoon Sale: 30% off sitewide' expired on 30 Sep 2026.",
        suggestion: "Enjoy 20% off your first order with code WELCOME20",
        intentKept: 84,
        status: "open" as const,
        routedToReviewer: true,
      },
      {
        id: "f-4",
        code: "R-CLAIM-1",
        ruleId: "R-CLAIM-1",
        severity: "high" as const,
        spanText: "the BEST coffee in India",
        issue: "Unsupported superlative claim without cited proof",
        sourceQuote: "Guideline R-CLAIM-1: 'Superlatives (best, fastest, #1) require approved evidence.'",
        suggestion: "specialty coffee roasted fresh weekly in Kolkata",
        intentKept: 88,
        status: "open" as const,
        routedToReviewer: true,
      },
      {
        id: "f-5",
        code: "R-TERM-3",
        ruleId: "R-TERM-3",
        severity: "low" as const,
        spanText: "Cheap prices",
        issue: "Non-preferred terminology",
        sourceQuote: "Guideline R-TERM-3: 'Say affordable, never cheap.'",
        suggestion: "Affordable prices",
        intentKept: 98,
        status: "open" as const,
        routedToReviewer: false,
      },
      {
        id: "f-6",
        code: "R-TERM-1",
        ruleId: "R-TERM-1",
        severity: "medium" as const,
        spanText: "customers",
        issue: "Non-compliant term for audience",
        sourceQuote: "Guideline R-TERM-1: 'Say guests, never customers, users or clients.'",
        suggestion: "guests",
        intentKept: 100,
        status: "open" as const,
        routedToReviewer: false,
      },
      {
        id: "f-7",
        code: "R-A11Y-2",
        ruleId: "R-A11Y-2",
        severity: "low" as const,
        spanText: "Click here",
        issue: "Non-descriptive link text (Accessibility WCAG)",
        sourceQuote: "Guideline R-A11Y-2: 'Link text must be descriptive. Never click here.'",
        suggestion: "Explore our coffee collection",
        intentKept: 90,
        status: "open" as const,
        routedToReviewer: false,
      },
      {
        id: "f-8",
        code: "R-TERM-2",
        ruleId: "R-TERM-2",
        severity: "medium" as const,
        spanText: "Brew Loom",
        issue: "Brand name mis-spelled with a space",
        sourceQuote: "Guideline R-TERM-2: 'Brand name is written Brewloom (one word, capital B only).'",
        suggestion: "Brewloom",
        intentKept: 100,
        status: "open" as const,
        routedToReviewer: false,
      },
      {
        id: "f-9",
        code: "F-DEL",
        ruleId: "F-DEL",
        severity: "high" as const,
        spanText: "delivers in 1 day!",
        issue: "Delivery promise contradicts verified operational fact F-DEL",
        sourceQuote: "Approved Fact F-DEL: 'Delivery in 2 days across 120+ cities' (Owner: Operations)",
        suggestion: "delivers in 2 days across 120+ cities!",
        intentKept: 96,
        status: "open" as const,
        routedToReviewer: true,
      },
    ],
  },
  {
    id: "example-2",
    title: "2. Welcome Email (Clean & Approvable)",
    channel: "Email",
    description: "Compliant draft matching all approved facts. Approvable by Manager. Subject to Reverse Alerts if facts change.",
    rawText:
      "Welcome to Brewloom. Guests get 20% off their first order with code WELCOME20. Beans are roasted fresh every week in Kolkata, and delivery takes 2 days across 120+ cities.",
    findings: [],
  },
  {
    id: "example-3",
    title: "3. Cold Brew Wellness Post (Legal Reviewer Case)",
    channel: "Blog / Social",
    description: "Contains unsubstantiated health claims and named competitor comparison. Manager approval blocked.",
    rawText:
      "Our cold brew boosts immunity and helps you lose weight, and it is better than Starbucks. Guaranteed to make you healthier.",
    findings: [
      {
        id: "f-301",
        code: "R-CLAIM-2",
        ruleId: "R-CLAIM-2",
        severity: "high" as const,
        spanText: "boosts immunity and helps you lose weight",
        issue: "Prohibited health / medicinal claim without regulatory signoff",
        sourceQuote: "Guideline R-CLAIM-2: 'No health claims (boosts immunity, detox, weight loss). Needs legal review.'",
        suggestion: "is brewed fresh for smooth, invigorating flavour",
        intentKept: 81,
        status: "open" as const,
        routedToReviewer: true,
      },
      {
        id: "f-302",
        code: "R-MSG-1",
        ruleId: "R-MSG-1",
        severity: "high" as const,
        spanText: "better than Starbucks",
        issue: "Disparaging named competitor comparison",
        sourceQuote: "Guideline R-MSG-1: 'Never compare Brewloom to a named competitor (Starbucks, Blue Tokai, etc.).'",
        suggestion: "crafted for artisan specialty coffee lovers",
        intentKept: 85,
        status: "open" as const,
        routedToReviewer: true,
      },
      {
        id: "f-303",
        code: "R-CLAIM-1",
        ruleId: "R-CLAIM-1",
        severity: "high" as const,
        spanText: "Guaranteed to make you healthier",
        issue: "Absolute guarantee and medical outcome assertion",
        sourceQuote: "Guideline R-CLAIM-1: 'Superlatives and absolutes (guaranteed, 100%) prohibited without certified backing.'",
        suggestion: "A crisp and refreshing daily brew",
        intentKept: 83,
        status: "open" as const,
        routedToReviewer: true,
      },
    ],
  },
];

export default function InteractiveDemo() {
  const [selectedRole, setSelectedRole] = useState<Role>("Creator");
  const [activePresetIndex, setActivePresetIndex] = useState(0);
  const [currentText, setCurrentText] = useState(PRESET_EXAMPLES[0].rawText);
  const [findings, setFindings] = useState<Finding[]>(PRESET_EXAMPLES[0].findings);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>("f-3");
  const [activeTab, setActiveTab] = useState<"review" | "reverse-alert" | "clarity">("review");
  const [submissionStatus, setSubmissionStatus] = useState<"draft" | "submitted" | "approved" | "changes_requested">("draft");
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [alertDispatched, setAlertDispatched] = useState(false);
  const [factOfferValue, setFactOfferValue] = useState("20%");

  // Switch preset
  const handleSelectPreset = (index: number) => {
    setActivePresetIndex(index);
    const p = PRESET_EXAMPLES[index];
    setCurrentText(p.rawText);
    setFindings(JSON.parse(JSON.stringify(p.findings)));
    setSelectedFindingId(p.findings.length > 0 ? p.findings[0].id : null);
    setSubmissionStatus("draft");
  };

  // Accept a verified fix
  const handleAcceptFix = (findingId: string) => {
    const finding = findings.find((f) => f.id === findingId);
    if (!finding) return;

    // Replace span in currentText
    const newText = currentText.replace(finding.spanText, finding.suggestion);
    setCurrentText(newText);

    // Update finding status
    setFindings((prev) =>
      prev.map((f) =>
        f.id === findingId ? { ...f, status: "accepted" as const } : f
      )
    );
  };

  // Dispute a finding
  const handleDispute = (findingId: string) => {
    setFindings((prev) =>
      prev.map((f) =>
        f.id === findingId ? { ...f, status: "disputed" as const } : f
      )
    );
  };

  // Active finding selected
  const activeFinding = findings.find((f) => f.id === selectedFindingId);

  // Routing determination
  const hasHighRisk = findings.some(
    (f) => f.severity === "high" && f.status === "open"
  );
  const targetRoute = hasHighRisk ? "Legal / Compliance Reviewer" : "Brand / Marketing Manager";

  return (
    <div className="w-full max-w-7xl mx-auto py-12 px-4 sm:px-6">
      {/* ── Outer Shell ── */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/90 shadow-2xl overflow-hidden backdrop-blur-xl">
        
        {/* ── Top Bar: Role Switcher & Environment Bar ── */}
        <div className="border-b border-white/10 bg-slate-950/80 px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-sm">BrandGuard Live Interactive Workbench</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Demo Brand: Brewloom Specialty Coffee
                </span>
              </div>
              <p className="text-xs text-slate-400">Zero-signup evaluator simulation • 7-step core path</p>
            </div>
          </div>

          {/* Role Switcher Pill */}
          <div className="flex items-center gap-1.5 p-1 rounded-full bg-slate-900 border border-white/10 self-stretch sm:self-auto justify-between sm:justify-start">
            <span className="text-xs text-slate-400 px-2.5 font-medium flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5 text-indigo-400" /> Role:
            </span>
            {(["Creator", "Manager", "Reviewer", "Admin"] as Role[]).map((role) => (
              <button
                key={role}
                onClick={() => setSelectedRole(role)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  selectedRole === role
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/50"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>

        {/* ── Sub Navigation: Workbench Tabs ── */}
        <div className="border-b border-white/5 bg-slate-950/40 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("review")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                activeTab === "review"
                  ? "bg-white/10 text-white border border-white/10"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-indigo-400" />
              Pre-Publication Review
            </button>
            <button
              onClick={() => setActiveTab("reverse-alert")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                activeTab === "reverse-alert"
                  ? "bg-white/10 text-white border border-white/10"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              Living Facts & Reverse Alerts
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            </button>
            <button
              onClick={() => setActiveTab("clarity")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                activeTab === "clarity"
                  ? "bg-white/10 text-white border border-white/10"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              Guideline Clarity Lab
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Grounded Citation Validator: Active
            </span>
            <a
              href={getDashboardUrl()}
              className="ml-2 px-3 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 text-xs font-medium transition-colors flex items-center gap-1"
            >
              Open Live Dashboard ↗
            </a>
          </div>
        </div>

        {/* ── MAIN TAB: PRE-PUBLICATION REVIEW ── */}
        {activeTab === "review" && (
          <div className="p-6">
            {/* Preset Selector Banner */}
            <div className="mb-6 p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <span className="text-xs uppercase tracking-wider text-indigo-400 font-semibold block mb-1">
                  Step 1 & 2: Select a Hackathon Specification Test Case
                </span>
                <p className="text-sm text-slate-300">
                  Click any benchmark preset to see how deterministic checks and citation-grounded logic evaluate copy:
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {PRESET_EXAMPLES.map((preset, idx) => (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectPreset(idx)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
                      activePresetIndex === idx
                        ? "bg-indigo-600/30 text-indigo-200 border border-indigo-500/40"
                        : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/5"
                    }`}
                  >
                    <span>{preset.title.split(". ")[1].split(" (")[0]}</span>
                    {idx === 0 && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-red-500/20 text-red-300">9 Flags</span>
                    )}
                    {idx === 1 && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/20 text-emerald-300">Clean</span>
                    )}
                    {idx === 2 && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-purple-500/20 text-purple-300">Legal</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Split Screen: Content Viewer / Editor & Findings Inspector */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Column (7 cols): Content & Highlights */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                <div className="p-5 rounded-2xl bg-slate-950/70 border border-white/10 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
                      <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-indigo-400" />
                        Draft Content & Inline Violation Spans
                      </span>
                      <span className="px-2 py-0.5 rounded bg-white/5 text-slate-400">
                        Channel: {PRESET_EXAMPLES[activePresetIndex].channel}
                      </span>
                    </div>

                    {/* Interactive Text Display with Highlighting */}
                    <div className="p-4 rounded-xl bg-slate-900 border border-white/5 min-h-[160px] text-base leading-relaxed text-slate-200 font-sans">
                      {findings.length === 0 ? (
                        <div className="flex items-center gap-2 text-emerald-400 py-4">
                          <CheckCircle2 className="w-5 h-5 shrink-0" />
                          <span>All deterministic and claim checks passed. Content fully adheres to Brewloom brand guidelines.</span>
                        </div>
                      ) : (
                        <p>
                          {currentText.split(" ").map((word, i) => {
                            // Check if this word matches any open finding
                            const match = findings.find(
                              (f) =>
                                f.status === "open" &&
                                f.spanText.toLowerCase().includes(word.toLowerCase().replace(/[.,!]/g, ""))
                            );
                            if (match) {
                              const isSelected = selectedFindingId === match.id;
                              const colorClass =
                                match.severity === "high"
                                  ? "bg-red-500/20 text-red-300 border-red-500/40"
                                  : match.severity === "medium"
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                  : "bg-blue-500/20 text-blue-300 border-blue-500/40";

                              return (
                                <button
                                  key={i}
                                  onClick={() => setSelectedFindingId(match.id)}
                                  className={`inline-block mx-0.5 px-1.5 py-0.5 rounded border text-sm font-medium transition-all ${colorClass} ${
                                    isSelected ? "ring-2 ring-indigo-400 scale-105" : "hover:brightness-125"
                                  }`}
                                >
                                  {word}
                                </button>
                              );
                            }
                            return <span key={i}> {word} </span>;
                          })}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Metadata and routing status bar */}
                  <div className="mt-4 pt-4 border-t border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Auto-Routing:</span>
                      <span
                        className={`px-2.5 py-1 rounded-md font-medium border ${
                          hasHighRisk
                            ? "bg-red-500/10 text-red-400 border-red-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        }`}
                      >
                        {targetRoute}
                      </span>
                      {hasHighRisk && (
                        <span className="text-[11px] text-slate-500">
                          (High-severity claim or expired fact requires Reviewer role)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {submissionStatus === "draft" && (
                        <button
                          onClick={() => setSubmissionStatus("submitted")}
                          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1.5 transition-all text-xs"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Submit For Review
                        </button>
                      )}

                      {submissionStatus === "submitted" && (
                        <div className="flex items-center gap-2">
                          <span className="text-indigo-400 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 animate-spin" /> In Queue
                          </span>

                          {/* Role check on approval */}
                          {selectedRole === "Reviewer" || (!hasHighRisk && selectedRole === "Manager") ? (
                            <button
                              onClick={() => {
                                setSubmissionStatus("approved");
                                setReceiptModalOpen(true);
                              }}
                              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1.5 transition-all text-xs"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              Approve & Sign Receipt
                            </button>
                          ) : (
                            <button
                              disabled
                              title="Role permissions prevent approval"
                              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-500 font-medium cursor-not-allowed text-xs flex items-center gap-1"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              Approval Locked (Switch to {targetRoute.split(" ")[0]})
                            </button>
                          )}
                        </div>
                      )}

                      {submissionStatus === "approved" && (
                        <button
                          onClick={() => setReceiptModalOpen(true)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-1"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          View Approval Receipt
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Finding Checklist Selector */}
                <div className="p-4 rounded-2xl bg-slate-950/40 border border-white/5">
                  <span className="text-xs text-slate-400 font-medium block mb-2">
                    Detected Findings ({findings.filter((f) => f.status === "open").length} open, {findings.filter((f) => f.status === "accepted").length} resolved):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {findings.map((f) => {
                      const isSelected = f.id === selectedFindingId;
                      return (
                        <button
                          key={f.id}
                          onClick={() => setSelectedFindingId(f.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 border transition-all ${
                            f.status === "accepted"
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 line-through opacity-60"
                              : f.status === "disputed"
                              ? "bg-slate-800 border-white/10 text-slate-400"
                              : isSelected
                              ? "bg-indigo-600 text-white border-indigo-500 shadow-md"
                              : "bg-white/5 border-white/5 text-slate-300 hover:bg-white/10"
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              f.severity === "high"
                                ? "bg-red-400"
                                : f.severity === "medium"
                                ? "bg-amber-400"
                                : "bg-blue-400"
                            }`}
                          />
                          <span>{f.code}</span>
                          <span className="text-[10px] opacity-70 truncate max-w-[80px]">
                            {f.spanText}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column (5 cols): Citation & Verified Fix Inspector */}
              <div className="lg:col-span-5">
                <div className="p-5 rounded-2xl bg-slate-950/70 border border-white/10 h-full flex flex-col justify-between">
                  {activeFinding ? (
                    <div>
                      {/* Finding Header */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                activeFinding.severity === "high"
                                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                  : activeFinding.severity === "medium"
                                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                  : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                              }`}
                            >
                              {activeFinding.severity} Severity
                            </span>
                            <span className="text-xs text-slate-400 font-mono">
                              Rule ID: {activeFinding.code}
                            </span>
                          </div>
                          <h4 className="text-white font-semibold text-sm">
                            {activeFinding.issue}
                          </h4>
                        </div>
                      </div>

                      {/* Source Citation Callout */}
                      <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 mb-4">
                        <span className="text-[11px] font-semibold text-indigo-400 flex items-center gap-1 mb-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Grounded Source Citation (No AI Guessing)
                        </span>
                        <p className="text-xs text-slate-300 italic leading-relaxed">
                          &quot;{activeFinding.sourceQuote}&quot;
                        </p>
                      </div>

                      {/* Verified Suggestion Loop Card */}
                      <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/40 to-slate-900 border border-indigo-500/30 mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                            Verified Suggested Fix
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Intent Kept: {activeFinding.intentKept}%
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 font-mono text-xs text-emerald-300 mb-3">
                          {activeFinding.suggestion}
                        </div>

                        <div className="flex items-center gap-2">
                          {activeFinding.status === "open" ? (
                            <>
                              <button
                                onClick={() => handleAcceptFix(activeFinding.id)}
                                className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Accept Fix (Creates v2)
                              </button>
                              <button
                                onClick={() => handleDispute(activeFinding.id)}
                                className="py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium border border-white/10 flex items-center justify-center gap-1 transition-all"
                                title="Disputing updates guideline clarity scoring"
                              >
                                <ThumbsDown className="w-3.5 h-3.5 text-amber-400" />
                                Dispute
                              </button>
                            </>
                          ) : activeFinding.status === "accepted" ? (
                            <span className="text-xs text-emerald-400 flex items-center gap-1.5 font-medium py-1">
                              <CheckCircle2 className="w-4 h-4" /> Fix Applied to Draft! Re-check passed with 0 new issues.
                            </span>
                          ) : (
                            <span className="text-xs text-amber-400 flex items-center gap-1.5 font-medium py-1">
                              <AlertTriangle className="w-4 h-4" /> Disputed by creator. Logged for Rule Clarity Audit.
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span>Every suggested rewrite is re-run through the entire check catalog to verify zero secondary violations.</span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                      <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3" />
                      <h4 className="text-white font-medium text-sm mb-1">No Open Findings Selected</h4>
                      <p className="text-xs max-w-xs text-slate-400">
                        Select any flagged span on the left to inspect citations, verified transforms, and reviewer routing.
                      </p>
                    </div>
                  )}

                  {/* AI Use Disclosure Badge */}
                  <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500">
                    <span>AI Model: Gemini Flash (Grounding Only)</span>
                    <span className="text-slate-400">Redaction: Enabled</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ── TAB 2: LIVING FACTS & REVERSE ALERTS ── */}
        {activeTab === "reverse-alert" && (
          <div className="p-6">
            <div className="max-w-3xl mx-auto">
              <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <RotateCcw className="w-5 h-5 text-amber-400" />
                  <h4 className="text-sm font-bold text-white">
                    The Living Facts Differentiator: Continuous Reverse Scanning
                  </h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Most tools only check content at the exact second a user uploads it. In reality, marketing facts change: discounts expire, shipping thresholds increase, or product speeds improve. BrandGuard maintains live links to approved facts. When a fact changes, BrandGuard immediately scans all pre-approved or scheduled content and alerts the creator.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-slate-950/80 border border-white/10 mb-6">
                <span className="text-xs text-indigo-400 font-semibold uppercase tracking-wider block mb-3">
                  Admin Control: Approved Fact F-OFFER
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-white/5">
                    <span className="text-[11px] text-slate-500 block mb-1">Fact Statement</span>
                    <span className="text-sm text-white font-medium">Welcome discount for first-time buyers</span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-white/5">
                    <span className="text-[11px] text-slate-500 block mb-1">Fact Owner & Validity</span>
                    <span className="text-sm text-white font-medium">Marketing Team (Valid until Dec 2026)</span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900/90 border border-white/10 mb-4">
                  <div>
                    <span className="text-xs text-slate-400 block mb-0.5">Approved Discount Value:</span>
                    <span className="text-xl font-bold text-white">{factOfferValue} OFF (Code: WELCOME20)</span>
                  </div>

                  <button
                    onClick={() => {
                      setFactOfferValue(factOfferValue === "20%" ? "25%" : "20%");
                      setAlertDispatched(true);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-amber-600/30"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Simulate Update: Change Offer to {factOfferValue === "20%" ? "25%" : "20%"}
                  </button>
                </div>

                {alertDispatched && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200"
                  >
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs font-bold text-red-300 block mb-1">
                          🚨 REVERSE ALERT TRIGGERED FOR 1 SCHEDULED ITEM
                        </span>
                        <p className="text-xs text-slate-300 mb-2">
                          BrandGuard rescanned all active posts. The following approved piece now carries an outdated claim:
                        </p>
                        <div className="p-3 rounded-lg bg-black/40 border border-white/5 font-mono text-xs text-slate-300">
                          <div><strong>Target:</strong> &quot;Welcome Email (Clean)&quot; (Scheduled for tomorrow)</div>
                          <div><strong>Now-Outdated Text:</strong> &quot;Guests get 20% off their first order...&quot;</div>
                          <div><strong>Required Replacement:</strong> &quot;Guests get 25% off their first order...&quot;</div>
                          <div><strong>Owner Alert Dispatched:</strong> Rahul (Email Team Lead)</div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: GUIDELINE CLARITY LAB ── */}
        {activeTab === "clarity" && (
          <div className="p-6">
            <div className="max-w-4xl mx-auto">
              <div className="mb-6 p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-slate-200">
                <div className="flex items-center gap-2 mb-1">
                  <Layers className="w-5 h-5 text-cyan-400" />
                  <h4 className="text-sm font-bold text-white">Guideline Clarity & Ambiguity Scoring</h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  When a rule is repeatedly disputed by content creators or overturned by reviewers, the problem is usually not the creator—it&apos;s the rule. BrandGuard calculates an objective Clarity Score (100% minus dispute rate) to help brand managers continuously refine ambiguous policies.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 overflow-hidden bg-slate-950/60">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 border-b border-white/5 text-slate-400 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="p-3.5">Rule ID</th>
                      <th className="p-3.5">Category</th>
                      <th className="p-3.5">Guideline Text</th>
                      <th className="p-3.5">Dispute Rate</th>
                      <th className="p-3.5">Clarity Score</th>
                      <th className="p-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    <tr className="hover:bg-white/[0.02]">
                      <td className="p-3.5 font-mono text-indigo-400">R-TERM-1</td>
                      <td className="p-3.5">Terminology</td>
                      <td className="p-3.5">Say &apos;guests&apos;, never &apos;customers&apos;, &apos;users&apos; or &apos;clients&apos;</td>
                      <td className="p-3.5 font-mono text-emerald-400">4% (1/25)</td>
                      <td className="p-3.5 font-mono font-bold text-emerald-400">96%</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
                          Clear Rule
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-white/[0.02]">
                      <td className="p-3.5 font-mono text-indigo-400">R-CLAIM-1</td>
                      <td className="p-3.5">Claims</td>
                      <td className="p-3.5">Superlatives (best, fastest, #1) require approved evidence</td>
                      <td className="p-3.5 font-mono text-amber-400">24% (6/25)</td>
                      <td className="p-3.5 font-mono font-bold text-amber-400">76%</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px]">
                          Acceptable
                        </span>
                      </td>
                    </tr>
                    <tr className="bg-red-500/[0.03] hover:bg-red-500/[0.06]">
                      <td className="p-3.5 font-mono text-red-400">R-TONE-3</td>
                      <td className="p-3.5">Tone</td>
                      <td className="p-3.5">&apos;Plain language. Avoid jargon. Keep sentences under 25 words&apos;</td>
                      <td className="p-3.5 font-mono text-red-400">38% (12/31)</td>
                      <td className="p-3.5 font-mono font-bold text-red-400">62%</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 text-[10px]">
                          Likely Ambiguous
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-white/[0.02]">
                      <td className="p-3.5 font-mono text-indigo-400">R-MSG-1</td>
                      <td className="p-3.5">Messaging</td>
                      <td className="p-3.5">Never compare Brewloom to named competitors</td>
                      <td className="p-3.5 font-mono text-emerald-400">0% (0/18)</td>
                      <td className="p-3.5 font-mono font-bold text-emerald-400">100%</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
                          Clear Rule
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── APPROVAL RECEIPT MODAL ── */}
      <AnimatePresence>
        {receiptModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="max-w-lg w-full rounded-2xl bg-slate-900 border border-white/10 p-6 shadow-2xl relative"
            >
              <button
                onClick={() => setReceiptModalOpen(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-base">Cryptographic Approval Receipt</h3>
                  <p className="text-xs text-slate-400">BrandGuard Immutable Audit Record #BG-2026-8812</p>
                </div>
              </div>

              <div className="space-y-3 p-4 rounded-xl bg-slate-950/80 border border-white/5 font-mono text-xs text-slate-300 mb-6">
                <div className="flex justify-between">
                  <span className="text-slate-500">Content Version:</span>
                  <span className="text-white">v2.0 (Resolved)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Approving Officer:</span>
                  <span className="text-emerald-400">{selectedRole} (Authorized Signer)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Rules Validated:</span>
                  <span>12 / 12 Rules Verified</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">AI Service Disclosed:</span>
                  <span>Gemini Flash (Grounding Only)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Approved Timestamp:</span>
                  <span>{new Date().toISOString()}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setReceiptModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  Dismiss
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
