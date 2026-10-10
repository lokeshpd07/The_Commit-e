import { useState } from 'react';
import { motion } from 'motion/react';
import {
  Wrench,
  DollarSign,
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Sliders,
  ShieldAlert,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api_client';
import { MaintenancePlanResponse, ReportItem } from '@/lib/types';
import { toast } from 'sonner';

interface MaintenancePlannerPageProps {
  onSelectReport: (report: ReportItem) => void;
}

export function MaintenancePlannerPage({ onSelectReport }: MaintenancePlannerPageProps) {
  const [budgetLimit, setBudgetLimit] = useState<number>(6000);
  const [crewHours, setCrewHours] = useState<number>(8.0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [planResult, setPlanResult] = useState<MaintenancePlanResponse | null>(null);

  async function handleGeneratePlan(e?: React.FormEvent) {
    if (e) e.preventDefault();

    if (budgetLimit <= 0 || crewHours <= 0) {
      toast.error('Please enter budget and crew capacity greater than zero.');
      return;
    }

    setIsGenerating(true);
    try {
      const result = await apiClient.createPlan({
        budget_limit: budgetLimit,
        crew_hours_capacity: crewHours,
      });
      setPlanResult(result);
      toast.success('Maintenance plan generated successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate maintenance plan.');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-card border border-border rounded-lg p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5" /> Section 3.4 • Maintenance Planner
          </div>
          <h2 className="text-xl font-bold text-foreground">Constraint-based Maintenance Optimization</h2>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            Input city budget and crew capacity limits. The backend endpoint <code className="bg-secondary px-1 py-0.5 rounded text-foreground">POST /api/v1/plans</code> selects optimal priority work items and details deferred tasks with explicit rationale.
          </p>
        </div>
      </div>

      {/* Inputs and Plan Parameters */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-lg p-6 shadow-sm space-y-4"
      >
        <div className="flex items-center gap-2 text-sm font-bold text-foreground border-b border-border pb-3">
          <Sliders className="w-4 h-4 text-primary" /> Define City Resource Constraints
        </div>

        <form onSubmit={handleGeneratePlan} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end text-xs">
          {/* Budget Limit Input */}
          <div className="space-y-1.5">
            <label className="font-medium text-foreground flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-500" /> Total Budget Limit ($)
            </label>
            <input
              type="number"
              min={500}
              max={100000}
              step={250}
              value={budgetLimit}
              onChange={(e) => setBudgetLimit(Number(e.target.value))}
              className="w-full px-3 py-2 border border-border rounded bg-background text-foreground font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-[10px] text-muted-foreground block">
              Adjust budget slider / number input
            </span>
          </div>

          {/* Crew Hours Capacity Input */}
          <div className="space-y-1.5">
            <label className="font-medium text-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-500" /> Crew-Hour Capacity (Hours)
            </label>
            <input
              type="number"
              min={1}
              max={200}
              step={0.5}
              value={crewHours}
              onChange={(e) => setCrewHours(Number(e.target.value))}
              className="w-full px-3 py-2 border border-border rounded bg-background text-foreground font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-[10px] text-muted-foreground block">
              Total available worker hours for dispatch
            </span>
          </div>

          {/* Submit Action */}
          <div>
            <Button
              type="submit"
              disabled={isGenerating}
              className="w-full h-10 text-xs font-semibold gap-2 shadow"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="animate-spin w-4 h-4" /> Optimizing Plan...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Generate Maintenance Plan
                </>
              )}
            </Button>
          </div>
        </form>
      </motion.div>

      {/* Plan Results Summary Dashboard */}
      {planResult && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-6"
        >
          {/* Key Metric Gauges */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="bg-card border border-border p-4 rounded-lg shadow-sm">
              <div className="text-muted-foreground flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Selected Works
              </div>
              <div className="text-2xl font-bold text-foreground">
                {(planResult.selected_jobs || planResult.selected_items || []).length} <span className="text-xs font-normal text-muted-foreground">reports</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">High-priority triage selected</div>
            </div>

            <div className="bg-card border border-border p-4 rounded-lg shadow-sm">
              <div className="text-muted-foreground flex items-center gap-1.5 mb-1">
                <DollarSign className="w-4 h-4 text-emerald-500" /> Total Estimated Cost
              </div>
              <div className="text-2xl font-bold font-mono text-foreground">
                ${planResult.total_cost.toLocaleString()}
              </div>
              <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden mt-2">
                <div
                  className="bg-emerald-500 h-full rounded-full"
                  style={{ width: `${Math.min(100, planResult.budget_utilization)}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 flex justify-between">
                <span>{planResult.budget_utilization}% of limit</span>
                <span>Max ${planResult.budget_limit.toLocaleString()}</span>
              </div>
            </div>

            <div className="bg-card border border-border p-4 rounded-lg shadow-sm">
              <div className="text-muted-foreground flex items-center gap-1.5 mb-1">
                <Clock className="w-4 h-4 text-blue-500" /> Total Labor Hours
              </div>
              <div className="text-2xl font-bold font-mono text-foreground">
                {planResult.total_hours} <span className="text-xs font-normal text-muted-foreground">hrs</span>
              </div>
              <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden mt-2">
                <div
                  className="bg-blue-500 h-full rounded-full"
                  style={{ width: `${Math.min(100, planResult.crew_utilization)}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 flex justify-between">
                <span>{planResult.crew_utilization}% of capacity</span>
                <span>Max {planResult.crew_hours_capacity} hrs</span>
              </div>
            </div>

            <div className="bg-card border border-border p-4 rounded-lg shadow-sm">
              <div className="text-muted-foreground flex items-center gap-1.5 mb-1">
                <AlertCircle className="w-4 h-4 text-amber-500" /> Deferred Items
              </div>
              <div className="text-2xl font-bold text-amber-500">
                {(planResult.deferred_jobs || planResult.deferred_items || []).length} <span className="text-xs font-normal text-muted-foreground">deferred</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">Exceeds current constraints</div>
            </div>
          </div>

          {/* Selected Work Plan Items Table */}
          <div className="bg-card border border-border rounded-lg p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-3 text-xs">
              <div className="font-bold text-foreground flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Approved &amp; Scheduled Repairs ({(planResult.selected_jobs || planResult.selected_items || []).length})
              </div>
              <span className="text-muted-foreground">Ordered by priority score</span>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>REPORT ID</th>
                    <th>LOCATION / ROAD</th>
                    <th>SEVERITY</th>
                    <th>PRIORITY SCORE</th>
                    <th>COST ESTIMATE</th>
                    <th>EST. HOURS</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(planResult.selected_jobs || planResult.selected_items || []).map((r: ReportItem) => (
                    <tr
                      key={r.report_id || r.id}
                      onClick={() => onSelectReport(r)}
                      className="hover:bg-accent/50 cursor-pointer"
                    >
                      <td className="font-mono text-xs font-bold text-primary">{r.report_id || r.id}</td>
                      <td>
                        <strong>{r.location || r.road_name}</strong>
                      </td>
                      <td>
                        <span className={`severity severity-${r.severity}`}>
                          <i />
                          {r.severity_label || (r.severity === 3 ? 'High' : 'Moderate')}
                        </span>
                      </td>
                      <td className="font-bold text-primary">{r.priority_score || r.priority}</td>
                      <td className="font-mono text-xs">${r.estimated_cost?.toLocaleString()}</td>
                      <td className="font-mono text-xs">{r.estimated_hours} hrs</td>
                      <td>
                        <Button size="icon" variant="ghost" aria-label="View item">
                          <ArrowUpRight size={16} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {(planResult.selected_jobs || planResult.selected_items || []).length === 0 && (
                <div className="py-8 text-center text-muted-foreground text-xs">
                  No items fit within the specified budget or crew capacity. Try increasing constraints.
                </div>
              )}
            </div>
          </div>

          {/* Deferred Items with Rationale */}
          {(planResult.deferred_jobs || planResult.deferred_items || []).length > 0 && (
            <div className="bg-card border border-border rounded-lg p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2 border-b border-border pb-3 text-xs font-bold text-foreground">
                <ShieldAlert className="w-4 h-4 text-amber-500" /> Deferred Repairs &amp; Backend Rationale ({(planResult.deferred_jobs || planResult.deferred_items || []).length})
              </div>

              <div className="space-y-2 text-xs">
                {(planResult.deferred_jobs || planResult.deferred_items || []).map(({ item, reason }: { item: ReportItem; reason: string }, idx: number) => (
                  <div
                    key={idx}
                    onClick={() => onSelectReport(item)}
                    className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer hover:bg-amber-500/15 transition-colors"
                  >
                    <div>
                      <div className="font-bold text-foreground flex items-center gap-2">
                        <span className="font-mono text-amber-600 dark:text-amber-400">{item.report_id || item.id}</span>
                        <span>{item.location || item.road_name}</span>
                        <span className="text-[10px] text-muted-foreground">(Priority: {item.priority_score})</span>
                      </div>
                      <div className="text-amber-700 dark:text-amber-300 text-[11px] mt-0.5">
                        <strong>Reason:</strong> {reason}
                      </div>
                    </div>

                    <div className="text-right font-mono text-[11px] text-muted-foreground shrink-0">
                      <div>${item.estimated_cost?.toLocaleString()}</div>
                      <div>{item.estimated_hours} hrs</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {!planResult && !isGenerating && (
        <div className="py-12 bg-card border border-border rounded-lg text-center text-muted-foreground space-y-2">
          <Wrench className="w-10 h-10 mx-auto text-primary/40" />
          <div className="font-semibold text-foreground text-sm">Ready to Optimize Maintenance Schedule</div>
          <p className="text-xs max-w-sm mx-auto">
            Set your desired budget limit and available crew hours above, then click &quot;Generate Maintenance Plan&quot;.
          </p>
        </div>
      )}
    </div>
  );
}
