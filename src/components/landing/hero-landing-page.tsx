import { motion } from 'motion/react';
import {
  Route as RouteIcon,
  Sparkles,
  Shield,
  ArrowRight,
  Camera,
  MapPin,
  Cpu,
  Layers,
  CheckCircle2,
  TrendingUp,
  Clock,
  ThumbsUp,
  Lock,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import potholeImg from '@/assets/pothole.jpg';

interface HeroLandingPageProps {
  onGetStarted: () => void;
  onSignIn: (defaultRole?: 'citizen' | 'admin') => void;
  onExplorePublicDashboard: () => void;
  onOpenFormulas: () => void;
  reportCount: number;
}

export function HeroLandingPage({
  onGetStarted,
  onSignIn,
  onExplorePublicDashboard,
  onOpenFormulas,
  reportCount,
}: HeroLandingPageProps) {
  return (
    <div className="space-y-16 py-6 md:py-10">
      {/* 1. HERO SECTION */}
      <section className="relative text-center max-w-4xl mx-auto space-y-6 px-4">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-xs"
        >
          <Sparkles size={14} className="text-emerald-600 animate-pulse" />
          <span>Next-Gen Smart Infrastructure &amp; Explainable Road Triage</span>
        </motion.div>

        {/* Main Title */}
        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-slate-900 leading-[1.15]"
        >
          Fixing City Roads with{' '}
          <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-800 bg-clip-text text-transparent">
            AI Vision &amp; Explainable Triage
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto font-normal leading-relaxed"
        >
          Empowering citizens to report road hazards with instant YOLOv11 defect scanning, while providing city road
          authorities with transparent, resource-optimized maintenance schedules.
        </motion.p>

        {/* Primary CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-wrap items-center justify-center gap-3.5 pt-2"
        >
          <Button
            size="lg"
            onClick={() => onSignIn('citizen')}
            className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 group transition-all cursor-pointer"
          >
            <Camera size={18} />
            <span>Report Pothole as Resident</span>
            <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </Button>

          <Button
            size="lg"
            variant="outline"
            onClick={() => onSignIn('admin')}
            className="px-6 py-3 border-slate-300 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-slate-800 font-semibold text-sm rounded-xl shadow-xs flex items-center gap-2 cursor-pointer"
          >
            <Shield size={18} className="text-emerald-600" />
            <span>City Authority Login</span>
          </Button>

          <Button
            size="lg"
            variant="ghost"
            onClick={onExplorePublicDashboard}
            className="px-5 py-3 text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 text-sm font-medium rounded-xl cursor-pointer"
          >
            <span>Explore Public Feed</span>
          </Button>
        </motion.div>

        {/* Live Metrics Ticker */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 border-t border-slate-200 max-w-3xl mx-auto text-center"
        >
          <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-xs">
            <div className="text-2xl font-extrabold text-slate-900 font-mono">{reportCount}</div>
            <div className="text-[11px] text-slate-500 font-medium">Logged Defects</div>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-xs">
            <div className="text-2xl font-extrabold text-emerald-600 font-mono">93.8%</div>
            <div className="text-[11px] text-slate-500 font-medium">YOLO Precision</div>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-xs">
            <div className="text-2xl font-extrabold text-teal-600 font-mono">200m</div>
            <div className="text-[11px] text-slate-500 font-medium">DBSCAN Zones</div>
          </div>

          <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-xs">
            <div className="text-2xl font-extrabold text-emerald-700 font-mono">100%</div>
            <div className="text-[11px] text-slate-500 font-medium">Explainable Triage</div>
          </div>
        </motion.div>
      </section>

      {/* 2. INTERACTIVE FEATURE SPOTLIGHT */}
      <section className="max-w-6xl mx-auto px-4 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900">How RoadSense AI Works</h2>
          <p className="text-xs md:text-sm text-slate-600 max-w-xl mx-auto">
            From resident image upload to automated machine vision, deterministic scoring, and budget optimization.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Resident AI Camera */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-emerald-500/50 hover:shadow-xl transition-all shadow-sm space-y-4 group">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Camera size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">1. Vision-Powered Reporting</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Residents snap a photo. YOLOv11 instantly identifies potholes, cracks, and calculates the bounding-box
              area ratio r = (w &times; h) / (W &times; H) for visual proxy severity.
            </p>
            <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200 text-[11px] text-emerald-800 font-mono">
              ✓ Automated Bounding Boxes &bull; Anti-Duplicate Alert
            </div>
          </div>

          {/* Card 2: 5-Factor Priority Formula */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-emerald-500/50 hover:shadow-xl transition-all shadow-sm space-y-4 group">
            <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-200 text-teal-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Cpu size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">2. Explainable Triage Rubric</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              No black boxes. Damage is ranked deterministically:
              <br />
              <strong className="text-emerald-700 font-mono text-[11px] block mt-1">
                P = 0.35S + 0.25T + 0.15R + 0.15C + 0.10U
              </strong>
              incorporating road importance, traffic flow, and hospital proximity.
            </p>
            <button
              onClick={onOpenFormulas}
              className="text-[11px] text-emerald-700 hover:underline flex items-center gap-1 font-semibold"
            >
              View Full Architecture Formula <ChevronRight size={12} />
            </button>
          </div>

          {/* Card 3: DBSCAN & Budget Optimizer */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-emerald-500/50 hover:shadow-xl transition-all shadow-sm space-y-4 group">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Layers size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">3. Cluster &amp; Resource Planner</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              DBSCAN groups nearby defects within 200m to save 10% on mobilization costs. A knapsack optimizer selects
              feasible repairs under strict budget and crew constraints.
            </p>
            <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200 text-[11px] text-emerald-800 font-mono">
              ✓ 10% Mobilization Savings &bull; Deferred Rationale
            </div>
          </div>
        </div>
      </section>

      {/* 3. DUAL PERSONA PORTALS SHOWCASE */}
      <section className="max-w-6xl mx-auto px-4">
        <div className="p-8 rounded-3xl bg-white border border-slate-200 shadow-xl space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900">Choose Your Workspace</h2>
            <p className="text-xs md:text-sm text-slate-600">
              Select your role to access customized dashboards and tools.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Resident Persona Banner */}
            <div className="p-6 rounded-2xl bg-slate-50 border border-emerald-200 space-y-4 flex flex-col justify-between hover:shadow-md transition-shadow">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-semibold text-xs border border-emerald-200">
                  <Camera size={14} /> Resident Citizen Portal
                </div>
                <h3 className="text-xl font-bold text-slate-900">Report &amp; Track Repairs</h3>
                <ul className="space-y-2 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    <span>Upload road damage with instant AI defect scan</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    <span>5-Stage Lifecycle Tracker (Submitted &rarr; Resolved)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    <span>Neighborhood map with 1-click community confirmation</span>
                  </li>
                </ul>
              </div>

              <Button
                onClick={() => onSignIn('citizen')}
                className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl py-2.5 shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                Enter Resident Portal <ArrowRight size={14} className="ml-1.5" />
              </Button>
            </div>

            {/* Admin Persona Banner */}
            <div className="p-6 rounded-2xl bg-slate-50 border border-teal-200 space-y-4 flex flex-col justify-between hover:shadow-md transition-shadow">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-teal-100 text-teal-800 font-semibold text-xs border border-teal-200">
                  <Shield size={14} /> City Road Authority Operations
                </div>
                <h3 className="text-xl font-bold text-slate-900">Triage, Clusters &amp; Planning</h3>
                <ul className="space-y-2 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-teal-600 shrink-0" />
                    <span>Operations Command Center with live emergency alerts</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-teal-600 shrink-0" />
                    <span>Explainable Triage Queue with Safety Override</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-teal-600 shrink-0" />
                    <span>Resource-constrained maintenance optimizer with knapsack solver</span>
                  </li>
                </ul>
              </div>

              <Button
                onClick={() => onSignIn('admin')}
                className="w-full mt-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs rounded-xl py-2.5 shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                Enter City Authority Operations <ArrowRight size={14} className="ml-1.5" />
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
