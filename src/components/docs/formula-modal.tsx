import { motion, AnimatePresence } from 'motion/react';
import { X, BookOpen, Cpu, Calculator, Layers, Target, ShieldAlert, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FormulaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FormulaModal({ isOpen, onClose }: FormulaModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl text-slate-800 p-6 md:p-8"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-200">
              <BookOpen size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">RoadSense AI — Architecture &amp; Formula Specification</h2>
              <p className="text-xs text-slate-500">
                Extracted from the Hackathon Project Solution Document &amp; Decision Engine Rubric
              </p>
            </div>
          </div>

          <div className="space-y-6 text-sm text-slate-700">
            {/* 1. Multi-Factor Priority Formula */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-base">
                <Calculator size={18} className="text-emerald-600" />
                <h3>1. Transparent Multi-Factor Priority Formula</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Rather than treating all citizen complaints in arbitrary FIFO order or relying solely on a 2D bounding
                box, RoadSense AI employs a 5-factor weighted rubric mapping all inputs to a bounded scale (0 ≤ P ≤ 100):
              </p>

              <div className="p-3.5 rounded-xl bg-emerald-100/80 border border-emerald-200 text-emerald-900 font-mono text-center text-sm md:text-base font-bold shadow-xs">
                P = 0.35·S + 0.25·T + 0.15·R + 0.15·C + 0.10·U
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs">
                  <strong className="text-slate-900 block font-semibold text-emerald-700">S — Damage Severity (35%)</strong>
                  <span className="text-slate-600">Low = 30 | Moderate = 65 | High / Critical = 95. Visual defect proxy area ratio r.</span>
                </div>
                <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs">
                  <strong className="text-slate-900 block font-semibold text-emerald-700">T — Traffic Volume (25%)</strong>
                  <span className="text-slate-600">Low = 20 | Moderate = 50 | Heavy = 80 | Severe = 100 (Peak commuter flow).</span>
                </div>
                <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs">
                  <strong className="text-slate-900 block font-semibold text-emerald-700">R — Road Class (15%)</strong>
                  <span className="text-slate-600">Residential = 25 | Collector = 55 | Major Arterial = 85 | Highway/Transit = 100.</span>
                </div>
                <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs">
                  <strong className="text-slate-900 block font-semibold text-emerald-700">C — Criticality Proximity (15%)</strong>
                  <span className="text-slate-600">None = 10 | School = 60 | Transit Hub = 75 | Hospital/Emergency Route = 100.</span>
                </div>
                <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs md:col-span-2">
                  <strong className="text-slate-900 block font-semibold text-emerald-700">U — Crowd Urgency &amp; Age (10%)</strong>
                  <span className="text-slate-600">U = min(100, 20 + 15 × (linked reports - 1) + 4 × days waiting).</span>
                </div>
              </div>
            </div>

            {/* 2. Visual AI Detection */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 text-teal-800 font-bold text-base">
                <Cpu size={18} className="text-teal-600" />
                <h3>2. Visual Perception (YOLOv11 &amp; Area Ratio)</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Images uploaded by residents or inspectors are passed to YOLOv11 for bounding box localization, defect
                classification, and bounding-box area ratio extraction:
              </p>
              <div className="p-2.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 font-mono text-xs text-center font-semibold">
                r = (bbox_width × bbox_height) / (image_width × image_height)
              </div>
              <p className="text-[11px] text-slate-500">
                *Note: 2D bounding boxes do not measure physical depth or pavement volume. They act as visual severity
                proxies combined with contextual road metadata.
              </p>
            </div>

            {/* 3. DBSCAN & Knapsack Optimization */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-base">
                <Layers size={18} className="text-emerald-600" />
                <h3>3. DBSCAN Work Zone Clustering &amp; 0/1 Knapsack Optimizer</h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                DBSCAN groups defects within 200m radius ($eps=0.002^\circ, min\_samples=2$), discounting mobilization cost
                by 10%. The knapsack solver maximizes aggregate priority reduction under discrete budget ($B$) and crew-hour ($H$) limits:
              </p>
              <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 font-mono text-xs text-center font-medium">
                max Σ (priority_score_i × x_i) subject to Σ (cost_i × x_i) ≤ B and Σ (hours_i × x_i) ≤ H
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              onClick={onClose}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl px-5 py-2 cursor-pointer shadow-xs"
            >
              Close Documentation
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
