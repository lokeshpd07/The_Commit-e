import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Database,
  Layers,
  Sparkles,
  Loader2,
  RefreshCw,
  Info,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api_client';
import { EvaluationSummaryResponse } from '@/lib/types';
import { toast } from 'sonner';

export function EvaluationPage() {
  const [loading, setLoading] = useState(true);
  const [simulateUnavailable, setSimulateUnavailable] = useState(false);
  const [data, setData] = useState<EvaluationSummaryResponse | null>(null);

  async function loadSummary(unavailableState: boolean = simulateUnavailable) {
    setLoading(true);
    try {
      const summary = await apiClient.getEvaluationSummary(unavailableState);
      setData(summary);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load evaluation summary');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSummary(simulateUnavailable);
  }, [simulateUnavailable]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-card border border-border rounded-lg p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" /> Section 3.5 • Model Evaluation & Benchmark Summary
          </div>
          <h2 className="text-xl font-bold text-foreground">Empirical Detection Performance</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Backend evaluation endpoint <code className="bg-secondary px-1 py-0.5 rounded text-foreground">GET /api/v1/evaluation/summary</code>. All metrics are measured on validation datasets.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Button
            size="sm"
            variant={simulateUnavailable ? 'default' : 'outline'}
            onClick={() => setSimulateUnavailable(!simulateUnavailable)}
            className="text-xs gap-1.5"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {simulateUnavailable ? 'Testing Unavailable State' : 'Simulate Unavailable State'}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadSummary(simulateUnavailable)}
            className="text-xs gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5 text-primary" /> Reload
          </Button>
        </div>
      </div>

      {/* Strict Ground Truth Disclaimer Banner */}
      <div className="p-3.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-800 dark:text-blue-300 text-xs flex items-start gap-2.5">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
        <div>
          <strong>Ground-Truth Policy Guarantee:</strong> The RoadSense AI frontend strictly displays measured validation scores returned by the backend. When metrics have not been measured on a dataset version, an explicit unavailable card is shown rather than fabricating dummy accuracy or recall statistics.
        </div>
      </div>

      {loading && (
        <div className="py-20 text-center space-y-3">
          <Loader2 className="w-8 h-8 mx-auto text-primary animate-spin" />
          <p className="text-xs text-muted-foreground">Fetching backend evaluation summary...</p>
        </div>
      )}

      {/* Unavailable State (Section 3.5 Requirement) */}
      {!loading && data && !data.available && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card border border-amber-500/30 rounded-lg p-10 text-center space-y-4 shadow-sm"
        >
          <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-bold text-foreground">Evaluation Metrics Currently Unavailable</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              {data.message || 'Model metrics have not been measured yet for this dataset version.'}
            </p>
          </div>

          <div className="p-4 rounded-md bg-secondary/50 max-w-md mx-auto text-left text-xs text-muted-foreground space-y-1">
            <div className="font-semibold text-foreground">Required Action:</div>
            <div>• Run backend model evaluation script on validation dataset</div>
            <div>• Endpoint will populate <code className="text-primary font-mono">/api/v1/evaluation/summary</code></div>
          </div>
        </motion.div>
      )}

      {/* Available Metrics View */}
      {!loading && data && data.available && data.metrics && (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Metadata Card */}
          <div className="bg-card border border-border rounded-lg p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="font-semibold text-foreground">Model Architecture:</span>
              <span className="font-mono bg-secondary px-2 py-0.5 rounded text-primary font-medium">
                {data.model_version || 'YOLOv8-Pothole'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              <span>Last Evaluated:</span>
              <strong className="text-foreground">
                {data.last_evaluated_at ? new Date(data.last_evaluated_at).toLocaleDateString('en-GB') : 'Recent'}
              </strong>
            </div>
          </div>

          {/* 4 Metric Gauges */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {[
              {
                name: 'Precision',
                value: data.metrics.precision,
                desc: 'True positive ratio in pothole detections',
                color: 'text-emerald-500',
                bar: 'bg-emerald-500',
              },
              {
                name: 'Recall',
                value: data.metrics.recall,
                desc: 'Ratio of total ground-truth potholes detected',
                color: 'text-blue-500',
                bar: 'bg-blue-500',
              },
              {
                name: 'mAP @ 50',
                value: data.metrics.map50,
                desc: 'Mean Average Precision at IoU 0.50 threshold',
                color: 'text-primary',
                bar: 'bg-primary',
              },
              {
                name: 'F1-Score',
                value: data.metrics.f1_score,
                desc: 'Harmonic mean of precision and recall',
                color: 'text-purple-500',
                bar: 'bg-purple-500',
              },
            ].map((m, idx) => (
              <motion.div
                key={m.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.08 }}
                className="bg-card border border-border p-5 rounded-lg shadow-sm space-y-2"
              >
                <div className="text-muted-foreground font-medium">{m.name}</div>
                <div className={`text-3xl font-bold font-mono ${m.color}`}>
                  {(m.value * 100).toFixed(1)}%
                </div>
                <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                  <div
                    className={`${m.bar} h-full rounded-full transition-all duration-700`}
                    style={{ width: `${m.value * 100}%` }}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground pt-1">{m.desc}</div>
              </motion.div>
            ))}
          </div>

          {/* Dataset Statistics */}
          {data.dataset_stats && (
            <div className="bg-card border border-border rounded-lg p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 font-bold text-foreground text-sm border-b border-border pb-3">
                <Database className="w-4 h-4 text-primary" /> Benchmark Dataset Statistics
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="p-4 bg-background border border-border rounded-lg text-center">
                  <div className="text-muted-foreground mb-1">Total Dataset Images</div>
                  <div className="text-2xl font-bold font-mono text-foreground">
                    {data.dataset_stats.total_images.toLocaleString()}
                  </div>
                </div>

                <div className="p-4 bg-background border border-border rounded-lg text-center">
                  <div className="text-muted-foreground mb-1">Annotated Pothole Bounding Boxes</div>
                  <div className="text-2xl font-bold font-mono text-primary">
                    {data.dataset_stats.annotated_potholes.toLocaleString()}
                  </div>
                </div>

                <div className="p-4 bg-background border border-border rounded-lg text-center">
                  <div className="text-muted-foreground mb-1">Test Evaluation Samples</div>
                  <div className="text-2xl font-bold font-mono text-emerald-500">
                    {data.dataset_stats.sample_count.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
