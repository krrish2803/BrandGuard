"use client";

import dynamic from "next/dynamic";
import Navbar from "@/components/Navbar";
import {
  HeroContent,
  StatsSection,
  ProblemSection,
  SolutionSection,
  ComparisonSection,
  FeaturesSection,
  HowItWorksSection,
  CTASection,
  FAQSection,
  Footer,
} from "@/components/Sections";
import InteractiveDemo from "@/components/InteractiveDemo";

// Dynamic imports for 3D scenes (no SSR)
const ShieldScene = dynamic(() => import("@/components/ShieldScene"), {
  ssr: false,
});
const GlobeScene = dynamic(() => import("@/components/GlobeScene"), {
  ssr: false,
});
const NetworkScene = dynamic(() => import("@/components/NetworkScene"), {
  ssr: false,
});

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden selection:bg-indigo-500 selection:text-white">
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative min-h-[90vh] flex items-center justify-center px-6 pt-24 pb-12">
        {/* 3D Shield behind hero text */}
        <ShieldScene className="absolute inset-0 opacity-40 pointer-events-none" />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-transparent to-slate-950 pointer-events-none" />
        <HeroContent />
      </section>

      {/* ── Stats / Trust Metrics ── */}
      <StatsSection />

      {/* ── Problem ── */}
      <ProblemSection />

      {/* ── Solution with 3D Globe ── */}
      <div className="relative">
        <GlobeScene className="absolute right-0 top-0 w-1/2 h-full opacity-25 pointer-events-none hidden lg:block" />
        <SolutionSection />
      </div>

      {/* ── Live Interactive Simulator ── */}
      <section id="interactive-demo" className="py-20 relative">
        <div className="max-w-7xl mx-auto px-6 mb-8 text-center">
          <span className="text-xs uppercase tracking-widest text-indigo-400 font-semibold px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20">
            Interactive Product Tour
          </span>
          <h2 className="text-3xl sm:text-5xl font-bold text-white mt-4">
            Test the Seven-Step Core Path Live
          </h2>
          <p className="text-slate-400 mt-3 max-w-2xl mx-auto text-sm sm:text-base">
            Switch between Creator, Manager, and Reviewer roles. Test live citation validation, verified rewrites, reverse alerts, and audit receipts without creating an account.
          </p>
        </div>
        <InteractiveDemo />
      </section>

      {/* ── Head-to-Head Comparison ── */}
      <ComparisonSection />

      {/* ── Features with Network animation ── */}
      <div className="relative">
        <NetworkScene className="absolute left-0 top-0 w-1/2 h-full opacity-20 pointer-events-none hidden lg:block" />
        <FeaturesSection />
      </div>

      {/* ── How It Works ── */}
      <HowItWorksSection />

      {/* ── CTA ── */}
      <CTASection />

      {/* ── FAQ ── */}
      <FAQSection />

      {/* ── Footer ── */}
      <Footer />
    </div>
  );
}
