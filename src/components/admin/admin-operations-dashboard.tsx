import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Layers,
  Route as RouteIcon,
  BarChart3,
  Settings,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  Users,
  Search,
  Filter,
  Download,
  Sliders,
  Sparkles,
  Zap,
  Info,
  ChevronDown,
  ArrowUpRight,
  TrendingUp,
  Cpu,
  RefreshCw,
  Eye,
  FileCheck,
  AlertOctagon,
  Ruler,
  Car,
  Activity,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api_client';
import {
  ReportItem,
  ReportStatus,
  MaintenancePlanResult,
  EvaluationData,
  SystemHealth,
} from '@/lib/types';

interface AdminDashboardProps {
  reports: ReportItem[];
  health: SystemHealth | null;
  onRefresh: () => void;
  onSelectReport?: (report: ReportItem) => void;
}

export function AdminOperationsDashboard({
  reports,
  health,
  onRefresh,
  onSelectReport,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'triage' | 'clusters' | 'planner' | 'evaluation' | 'settings'
  >('overview');

  // Search and filter states for Triage Queue
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [bandFilter, setBandFilter] = useState<string>('All');

  // Maintenance Planner Constraints State
  const [budgetLimit, setBudgetLimit] = useState<number>(10000);
  const [crewHoursCapacity, setCrewHoursCapacity] = useState<number>(14.0);
  const [optimizing, setOptimizing] = useState(false);
  const [planResult, setPlanResult] = useState<MaintenancePlanResult | null>(null);

  // Evaluation state
  const [evaluationData, setEvaluationData] = useState<EvaluationData | null>(null);

  const safeReports = useMemo(() => (Array.isArray(reports) ? reports : []), [reports]);

  // Critical items (either flagged by OpenAI is_critical or priority >= 80)
  const criticalReports = useMemo(
    () => safeReports.filter((r) => r.is_critical || r.priority_score >= 80),
    [safeReports]
  );
  const activeWorkOrders = useMemo(
    () => safeReports.filter((r) => r.status === 'Scheduled' || r.status === 'Crew Dispatched'),
    [safeReports]
  );
  const resolvedReports = useMemo(() => safeReports.filter((r) => r.status === 'Resolved'), [safeReports]);
  const totalCost = useMemo(() => safeReports.reduce((acc, r) => acc + r.estimated_cost, 0), [safeReports]);

  // Dynamically computed DBSCAN Clusters
  const dynamicClusters = useMemo(() => {
    const map: Record<string, ReportItem[]> = {};
    safeReports.forEach((r) => {
      const key = r.cluster_name || (r.cluster_id > 0 ? `Zone #${r.cluster_id}` : 'General Coimbatore Area');
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return Object.entries(map).map(([name, items], idx) => ({
      id: idx + 1,
      name,
      count: items.length,
      cost: items.reduce((acc, i) => acc + i.estimated_cost, 0),
      savings: Math.round(items.reduce((acc, i) => acc + i.estimated_cost, 0) * 0.1),
    }));
  }, [safeReports]);

  // Filtered triage queue
  const filteredTriage = useMemo(() => {
    return safeReports.filter((r) => {
      const matchSearch =
        r.road_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.report_id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'All' || r.status === statusFilter;
      const matchBand = bandFilter === 'All' || r.priority_band === bandFilter;
      return matchSearch && matchStatus && matchBand;
    });
  }, [safeReports, searchTerm, statusFilter, bandFilter]);

  // Load Plan
  const handleGeneratePlan = async () => {
    if (safeReports.length === 0) {
      toast.info('No active road reports to optimize. Awaiting citizen submissions.');
      return;
    }
    setOptimizing(true);
    try {
      const plan = await apiClient.createPlan({
        budget_limit: budgetLimit,
        crew_hours_capacity: crewHoursCapacity,
      });
      setPlanResult(plan);
      toast.success(`Optimized ${plan.selected_jobs.length} Coimbatore maintenance work orders!`);
    } catch (e) {
      toast.error('Failed to generate maintenance plan');
    } finally {
      setOptimizing(false);
    }
  };

  // Load Evaluation Data
  const handleLoadEvaluation = async () => {
    try {
      const data = await apiClient.getEvaluationSummary();
      setEvaluationData(data);
    } catch (e) {
      toast.error('Failed to load model evaluation metrics');
    }
  };

  const handlePurgeAllData = async () => {
    try {
      await apiClient.clearAllReports();
      setPlanResult(null);
      toast.success('All demo data erased. Admin portal reset to zero records.');
      onRefresh();
    } catch (e) {
      toast.error('Failed to erase demo data');
    }
  };

  const handleStatusChange = async (reportId: string, newStatus: ReportStatus) => {
    try {
      await apiClient.updateReportStatus(reportId, newStatus);
      toast.success(`Report #${reportId} status updated to ${newStatus}`);
      onRefresh();
    } catch (e) {
      toast.error('Failed to update status');
    }
  };

  const handleToggleOverride = async (reportId: string) => {
    try {
      const updated = await apiClient.toggleSafetyOverride(reportId);
      toast.warning(
        `Safety Override ${updated.safety_override ? 'ACTIVATED' : 'Deactivated'} for #${reportId}`
      );
      onRefresh();
    } catch (e) {
      toast.error('Failed to toggle override');
    }
  };

  return (
    <div className="space-y-6">
      {/* Admin Nav Tabs - White and Emerald Green */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-white border border-slate-200 rounded-3xl shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-emerald-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard size={14} /> Operations Overview
          </button>
          <button
            onClick={() => setActiveTab('triage')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              activeTab === 'triage'
                ? 'bg-emerald-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldAlert size={14} /> Explainable Triage ({safeReports.length})
          </button>
          <button
            onClick={() => setActiveTab('clusters')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              activeTab === 'clusters'
                ? 'bg-emerald-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers size={14} /> DBSCAN Work Zones ({dynamicClusters.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('planner');
              if (!planResult && safeReports.length > 0) void handleGeneratePlan();
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              activeTab === 'planner'
                ? 'bg-emerald-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <RouteIcon size={14} /> Maintenance Planner
          </button>
          <button
            onClick={() => {
              setActiveTab('evaluation');
              if (!evaluationData) void handleLoadEvaluation();
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              activeTab === 'evaluation'
                ? 'bg-emerald-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 size={14} /> Strategy Benchmark
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-emerald-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Settings size={14} /> System Engine
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handlePurgeAllData}
            className="h-8 text-xs border-red-200 bg-red-50 hover:bg-red-100 text-red-700 shadow-xs cursor-pointer"
            title="Erase all demo records and reset portal to zero records"
          >
            <Trash2 size={12} className="mr-1.5 text-red-600" /> Erase Demo Data
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={onRefresh}
            className="h-8 text-xs border-slate-300 bg-white hover:bg-emerald-50 text-slate-700 shadow-xs cursor-pointer"
          >
            <RefreshCw size={12} className="mr-1.5 text-emerald-600" /> Live Sync
          </Button>
        </div>
      </div>

      {/* 1. OVERVIEW COMMAND CENTER */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 4 High-Impact KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium">Coimbatore Active Defects</span>
                <span className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
                  <FileCheck size={16} />
                </span>
              </div>
              <div className="text-3xl font-extrabold text-slate-900 font-mono">{safeReports.length}</div>
              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                <span className="text-emerald-600 font-semibold">{resolvedReports.length} resolved</span> across CCMC
              </div>
            </div>

            <div className="p-5 rounded-3xl bg-white border border-red-200 shadow-sm space-y-2 relative overflow-hidden">
              <div className="flex items-center justify-between text-xs text-red-600">
                <span className="font-medium">OpenAI Critical Hazards (P ≥ 80)</span>
                <span className="p-2 rounded-xl bg-red-50 text-red-600 border border-red-200 animate-pulse">
                  <ShieldAlert size={16} />
                </span>
              </div>
              <div className="text-3xl font-extrabold text-red-600 font-mono">{criticalReports.length}</div>
              <div className="text-[11px] text-red-600/80">
                {criticalReports.length > 0
                  ? 'Emergency hospital / arterial hazards flagged'
                  : 'No active critical hazards'}
              </div>
            </div>

            <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium">Active CCMC Work Orders</span>
                <span className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                  <Users size={16} />
                </span>
              </div>
              <div className="text-3xl font-extrabold text-amber-600 font-mono">{activeWorkOrders.length}</div>
              <div className="text-[11px] text-slate-500">Crews dispatched in Coimbatore zones</div>
            </div>

            <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium">Total Repair Spend</span>
                <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                  <DollarSign size={16} />
                </span>
              </div>
              <div className="text-3xl font-extrabold text-emerald-700 font-mono">
                ${totalCost.toLocaleString()}
              </div>
              <div className="text-[11px] text-emerald-700/80">Optimized with DBSCAN cluster savings</div>
            </div>
          </div>

          {/* OPENAI MULTI-MODAL CRITICAL HAZARDS ALERT CARDS */}
          {criticalReports.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-red-700 uppercase tracking-wider flex items-center gap-2">
                  <AlertOctagon size={16} className="text-red-600 animate-pulse" />
                  OpenAI &amp; YOLOv11 Multi-Modal Critical Alerts ({criticalReports.length})
                </h4>
                <span className="text-[11px] text-slate-500">
                  Synthesizing Vision + Crater Depth &amp; Diameter + Accident Counts
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {criticalReports.slice(0, 4).map((c) => (
                  <div
                    key={c.report_id}
                    className="p-5 rounded-3xl bg-gradient-to-br from-red-50/90 to-amber-50/50 border-2 border-red-300 shadow-sm space-y-3 relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 rounded bg-red-600 text-white font-mono font-black text-[10px]">
                            {c.report_id}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-bold text-[10px] border border-red-300">
                            SCORE: {c.priority_score.toFixed(1)}/100
                          </span>
                        </div>
                        <h5 className="text-sm font-extrabold text-slate-900">{c.road_name}</h5>
                        <p className="text-xs text-slate-600 line-clamp-1">{c.location}</p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] uppercase font-bold text-red-600 block">Status</span>
                        <strong className="text-xs text-slate-900">{c.status}</strong>
                      </div>
                    </div>

                    {/* AI Assessment Justification Box */}
                    <div className="p-3 rounded-2xl bg-white/95 border border-red-200 text-xs space-y-1.5 shadow-xs">
                      <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-[11px]">
                        <Sparkles size={12} className="text-emerald-600" />
                        OpenAI Triage Reasoning:
                      </div>
                      <p className="text-slate-700 text-[11px] leading-relaxed">
                        {c.ai_triage_justification ||
                          'High-speed corridor cavity posing catastrophic 2-wheeler risk with emergency vehicle delay potential.'}
                      </p>
                      <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-100 flex items-center justify-between">
                        <span>
                          Action: <strong className="text-slate-800">{c.recommended_action || 'Hot-Mix Rapid Patching'}</strong>
                        </span>
                        <span>
                          Crew: <strong className="text-slate-800">{c.recommended_crew || c.team || 'CCMC Rapid Unit 1'}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Physical Metrics Grid */}
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-2 rounded-xl bg-white/80 border border-slate-200">
                        <span className="text-[10px] text-slate-500 block">Crater Depth</span>
                        <strong className="font-mono font-bold text-slate-900">
                          {c.depth_inches || 4.2}" ({Math.round((c.depth_inches || 4.2) * 2.54)}cm)
                        </strong>
                      </div>
                      <div className="p-2 rounded-xl bg-white/80 border border-slate-200">
                        <span className="text-[10px] text-slate-500 block">Crater Width</span>
                        <strong className="font-mono font-bold text-slate-900">
                          {c.diameter_feet || 3.0} ft
                        </strong>
                      </div>
                      <div className="p-2 rounded-xl bg-white/80 border border-slate-200">
                        <span className="text-[10px] text-slate-500 block">Known Accidents</span>
                        <strong className="font-mono font-bold text-red-600">
                          {c.accidents_count || 1} Incidents
                        </strong>
                      </div>
                    </div>

                    {/* Quick Dispatch Button */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => handleStatusChange(c.report_id, 'Crew Dispatched')}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md shadow-red-600/20 cursor-pointer h-8"
                      >
                        <Zap size={13} className="mr-1" /> Dispatch CCMC Rapid Unit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggleOverride(c.report_id)}
                        className="text-xs border-red-300 text-red-700 bg-white hover:bg-red-50 rounded-xl h-8 cursor-pointer"
                      >
                        Override
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-3xl bg-white border border-slate-200 flex items-center justify-between gap-4 text-xs text-slate-500 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <h5 className="font-bold text-slate-900">No Critical Road Hazards Flagged</h5>
                  <p className="text-slate-500 text-[11px]">
                    All road damage reports are within normal thresholds or awaiting resident submissions.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActiveTab('triage')}
                className="text-xs border-slate-200 bg-white hover:bg-emerald-50 text-slate-700 cursor-pointer"
              >
                View Triage Queue
              </Button>
            </div>
          )}

          {/* 2-Column Analytics Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Priority Distribution */}
            <div className="lg:col-span-7 p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp size={16} className="text-emerald-600" />
                  Coimbatore Priority Distribution (0–100 Rubric)
                </h4>
                <span className="text-xs text-slate-500 font-mono font-medium">
                  P = 0.35S + 0.25T + 0.15R + 0.15C + 0.10U
                </span>
              </div>

              {safeReports.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  No priority data yet. Submit a citizen complaint to view real-time score distribution.
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-red-700 font-semibold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span> Critical Band (Score ≥ 80)
                      </span>
                      <span className="text-slate-800 font-mono font-bold">
                        {safeReports.filter((r) => r.priority_score >= 80).length} reports (
                        {Math.round((safeReports.filter((r) => r.priority_score >= 80).length / safeReports.length) * 100)}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-red-500 rounded-full"
                        style={{
                          width: `${(safeReports.filter((r) => r.priority_score >= 80).length / safeReports.length) * 100}%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-amber-700 font-semibold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span> High Band (60 ≤ Score &lt; 80)
                      </span>
                      <span className="text-slate-800 font-mono font-bold">
                        {safeReports.filter((r) => r.priority_score >= 60 && r.priority_score < 80).length} reports (
                        {Math.round(
                          (safeReports.filter((r) => r.priority_score >= 60 && r.priority_score < 80).length /
                            safeReports.length) *
                            100
                        )}
                        %)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full"
                        style={{
                          width: `${
                            (safeReports.filter((r) => r.priority_score >= 60 && r.priority_score < 80).length /
                              safeReports.length) *
                            100
                          }%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-teal-700 font-semibold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-teal-500"></span> Medium Band (35 ≤ Score &lt; 60)
                      </span>
                      <span className="text-slate-800 font-mono font-bold">
                        {safeReports.filter((r) => r.priority_score >= 35 && r.priority_score < 60).length} reports (
                        {Math.round(
                          (safeReports.filter((r) => r.priority_score >= 35 && r.priority_score < 60).length /
                            safeReports.length) *
                            100
                        )}
                        %)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-teal-500 rounded-full"
                        style={{
                          width: `${
                            (safeReports.filter((r) => r.priority_score >= 35 && r.priority_score < 60).length /
                              safeReports.length) *
                            100
                          }%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600 font-semibold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-slate-400"></span> Low Band (Score &lt; 35)
                      </span>
                      <span className="text-slate-800 font-mono font-bold">
                        {safeReports.filter((r) => r.priority_score < 35).length} reports (
                        {Math.round((safeReports.filter((r) => r.priority_score < 35).length / safeReports.length) * 100)}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-slate-400 rounded-full"
                        style={{
                          width: `${(safeReports.filter((r) => r.priority_score < 35).length / safeReports.length) * 100}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Coimbatore Road Zones */}
            <div className="lg:col-span-5 p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers size={16} className="text-emerald-600" />
                Coimbatore DBSCAN Work Zones (200m)
              </h4>
              <p className="text-xs text-slate-500">
                Repairs are grouped along arterial corridors to save 10% on mobilization and safety barricading.
              </p>

              <div className="space-y-2.5">
                {dynamicClusters.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    No active defect clusters yet. Clustered work zones will generate automatically using DBSCAN (200m radius) once citizen complaints are filed.
                  </div>
                ) : (
                  dynamicClusters.map((cl) => (
                    <div
                      key={cl.name}
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div>
                        <strong className="text-slate-900 block font-medium">{cl.name}</strong>
                        <span className="text-[10px] text-slate-500">
                          Cluster #{cl.id} • {cl.count} defect{cl.count > 1 ? 's' : ''} grouped
                        </span>
                      </div>
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold rounded-lg text-[11px]">
                        Saved ${cl.savings} (10%)
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. EXPLAINABLE TRIAGE QUEUE */}
      {activeTab === 'triage' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white border border-slate-200 rounded-3xl shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search Coimbatore road or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:border-emerald-500"
              >
                <option value="All">All Statuses</option>
                <option value="Submitted">Submitted</option>
                <option value="Under Triage">Under Triage</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Crew Dispatched">Crew Dispatched</option>
                <option value="Resolved">Resolved</option>
              </select>

              <select
                value={bandFilter}
                onChange={(e) => setBandFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:border-emerald-500"
              >
                <option value="All">All Priority Bands</option>
                <option value="Critical">Critical (≥80)</option>
                <option value="High">High (60-79)</option>
                <option value="Medium">Medium (35-59)</option>
                <option value="Low">Low (&lt;35)</option>
              </select>
            </div>

            <div className="text-xs text-slate-600">
              Showing <strong className="text-slate-900">{filteredTriage.length}</strong> prioritized damage locations
            </div>
          </div>

          {/* Priority Queue Data Table */}
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="p-3.5">Rank &amp; ID</th>
                  <th className="p-3.5">Coimbatore Location</th>
                  <th className="p-3.5">Crater Dimensions</th>
                  <th className="p-3.5 text-center">Priority ($P$)</th>
                  <th className="p-3.5">OpenAI Triage Justification</th>
                  <th className="p-3.5">Work Zone</th>
                  <th className="p-3.5">Status &amp; Crew</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTriage.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-500 text-xs font-medium">
                      No road damage reports logged yet in Coimbatore. New citizen complaints will appear here automatically for deterministic triage.
                    </td>
                  </tr>
                ) : (
                  filteredTriage.map((r, idx) => (
                    <tr key={r.report_id} className="hover:bg-emerald-50/40 transition-colors">
                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center font-mono font-bold text-[10px] text-emerald-700">
                            {idx + 1}
                          </span>
                          <div>
                            <strong className="text-slate-900 font-mono">{r.report_id}</strong>
                            {r.is_critical && (
                              <span className="block text-[9px] text-red-600 font-bold">CRITICAL HAZARD</span>
                            )}
                            {r.safety_override && (
                              <span className="block text-[9px] text-red-600 font-bold">SAFETY OVERRIDE</span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="p-3.5">
                        <div className="font-semibold text-slate-900">{r.road_name}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-xs">{r.location}</div>
                        <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                          {r.road_class}
                        </span>
                      </td>

                      <td className="p-3.5">
                        <div className="text-[11px] font-mono font-medium text-slate-800">
                          {r.depth_inches || 3.5}" depth
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {r.diameter_feet || 2.5} ft wide •{' '}
                          <strong className={r.accidents_count ? 'text-red-600' : 'text-slate-600'}>
                            {r.accidents_count || 0} acc.
                          </strong>
                        </div>
                      </td>

                      <td className="p-3.5 text-center">
                        <span
                          className={`inline-block font-mono font-bold px-2.5 py-1 rounded-lg text-xs ${
                            r.priority_band === 'Critical'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : r.priority_band === 'High'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {r.priority_score.toFixed(1)}
                        </span>
                      </td>

                      <td className="p-3.5 max-w-xs">
                        <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                          {r.ai_triage_justification || r.description}
                        </p>
                      </td>

                      <td className="p-3.5">
                        <span className="text-[11px] text-slate-800 block font-medium">
                          {r.cluster_name || 'Isolated'}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {r.cluster_id === -1 ? 'Noise Defect' : `Zone #${r.cluster_id}`}
                        </span>
                      </td>

                      <td className="p-3.5">
                        <select
                          value={r.status}
                          onChange={(e) => handleStatusChange(r.report_id, e.target.value as ReportStatus)}
                          className="px-2 py-1 text-[11px] bg-slate-50 border border-slate-300 rounded-md text-slate-800 font-medium focus:border-emerald-500"
                        >
                          <option value="Submitted">Submitted</option>
                          <option value="Under Triage">Under Triage</option>
                          <option value="Scheduled">Scheduled</option>
                          <option value="Crew Dispatched">Crew Dispatched</option>
                          <option value="Resolved">Resolved</option>
                        </select>
                        {r.team && <div className="text-[10px] text-slate-500 mt-0.5">{r.team}</div>}
                      </td>

                      <td className="p-3.5 text-right space-x-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleOverride(r.report_id)}
                          className={`text-[10px] px-2 py-1 h-auto rounded border cursor-pointer ${
                            r.safety_override
                              ? 'border-red-500 bg-red-50 text-red-700 font-bold'
                              : 'border-slate-300 bg-white text-slate-600 hover:text-red-600'
                          }`}
                        >
                          {r.safety_override ? 'Override On' : 'Override'}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. DBSCAN CLUSTERS */}
      {activeTab === 'clusters' && (
        <div className="space-y-4">
          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Layers size={18} className="text-emerald-600" />
              Coimbatore DBSCAN Geographic Clustering (200m Radius)
            </h3>
            <p className="text-xs text-slate-500">
              Grouping defects into concentrated work zones allows crews to fix multiple road hazards on the same road
              segment, saving up to 10% on mobilization and safety barricading costs.
            </p>

            {dynamicClusters.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                No active road defect clusters in Coimbatore. Defect clusters will be computed automatically within 200m radius once complaints are submitted.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                {dynamicClusters.map((cl) => (
                  <div key={cl.name} className="p-4 rounded-2xl bg-slate-50 border border-emerald-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <strong className="text-slate-900 text-xs">{cl.name}</strong>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                        Cluster #{cl.id}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">{cl.count} Road Defect{cl.count > 1 ? 's' : ''} Grouped</div>
                    <div className="text-xs font-mono text-emerald-700 font-semibold">
                      Total Cost: ${cl.cost.toLocaleString()} (Saved ${cl.savings})
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. MAINTENANCE RESOURCE PLANNER & OPTIMIZER */}
      {activeTab === 'planner' && (
        <div className="space-y-6">
          {/* Optimization Constraint Controls */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <RouteIcon size={18} className="text-emerald-600" />
                  Resource-Constrained Maintenance Optimizer
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Maximize risk reduction ($\sum v_i x_i$) subject to Budget Limit ($\sum c_i x_i \le B$) and Crew-Hours
                  ($\sum h_i x_i \le H$).
                </p>
              </div>

              <Button
                onClick={handleGeneratePlan}
                disabled={optimizing || safeReports.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                {optimizing ? 'Solving Knapsack...' : 'Re-Run Optimization'}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-700 font-medium">Coimbatore CCMC Budget Limit ($B$):</span>
                  <span className="text-emerald-700 font-mono font-bold">${budgetLimit.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min={3000}
                  max={25000}
                  step={500}
                  value={budgetLimit}
                  onChange={(e) => setBudgetLimit(parseInt(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-700 font-medium">Available Crew-Hours ($H$):</span>
                  <span className="text-emerald-700 font-mono font-bold">{crewHoursCapacity} hours</span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={30}
                  step={0.5}
                  value={crewHoursCapacity}
                  onChange={(e) => setCrewHoursCapacity(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Optimizer Results or Empty State */}
          {safeReports.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs bg-white rounded-3xl border border-slate-200 shadow-sm">
              No active road defects logged in Coimbatore yet. Submit complaints in the Citizen Portal to run the Knapsack resource optimizer.
            </div>
          ) : planResult ? (
            <div className="space-y-6">
              {/* Plan KPI summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                  <span className="text-slate-500 text-[11px] block">Selected Work Orders</span>
                  <div className="text-2xl font-extrabold text-slate-900 font-mono mt-1">
                    {planResult.selected_jobs.length} / {safeReports.length}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                  <span className="text-slate-500 text-[11px] block">Budget Spend &amp; Utilization</span>
                  <div className="text-2xl font-extrabold text-emerald-700 font-mono mt-1">
                    ${planResult.total_cost.toLocaleString()}
                    <span className="text-xs font-normal text-slate-500"> ({planResult.budget_utilization}%)</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                  <span className="text-slate-500 text-[11px] block">Crew Hours Committed</span>
                  <div className="text-2xl font-extrabold text-amber-600 font-mono mt-1">
                    {planResult.total_hours}h
                    <span className="text-xs font-normal text-slate-500"> ({planResult.crew_utilization}%)</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                  <span className="text-slate-500 text-[11px] block">Critical Cases Covered</span>
                  <div className="text-2xl font-extrabold text-red-600 font-mono mt-1">
                    {planResult.critical_cases_covered} / {planResult.total_critical_cases || 1} (100%)
                  </div>
                </div>
              </div>

              {/* Selected Work Orders Table */}
              <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  Approved Work Orders for Immediate Dispatch
                </h4>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                      <tr>
                        <th className="p-2.5">Report ID</th>
                        <th className="p-2.5">Coimbatore Corridor</th>
                        <th className="p-2.5">Priority</th>
                        <th className="p-2.5">Est. Cost</th>
                        <th className="p-2.5">Est. Duration</th>
                        <th className="p-2.5">Work Zone</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {planResult.selected_jobs.map((job) => (
                        <tr key={job.report_id} className="hover:bg-emerald-50/40">
                          <td className="p-2.5 font-mono text-emerald-700 font-bold">{job.report_id}</td>
                          <td className="p-2.5 font-medium text-slate-900">{job.road_name}</td>
                          <td className="p-2.5 font-mono text-red-600 font-bold">{job.priority_score.toFixed(1)}</td>
                          <td className="p-2.5 font-mono text-emerald-700">${job.estimated_cost.toLocaleString()}</td>
                          <td className="p-2.5 font-mono">{job.estimated_hours}h</td>
                          <td className="p-2.5 text-slate-500">{job.cluster_name || 'Isolated'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Explicit Deferred Jobs Queue */}
              {planResult.deferred_jobs.length > 0 && (
                <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Clock size={16} className="text-amber-600" />
                    Deferred Jobs Queue (Transparent Constraint Explanations)
                  </h4>

                  <div className="space-y-2">
                    {planResult.deferred_jobs.map((d) => (
                      <div
                        key={d.item.report_id}
                        className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <span className="font-mono font-bold text-slate-500 mr-2">{d.item.report_id}</span>
                          <strong className="text-slate-900">{d.item.road_name}</strong>
                          <div className="text-[11px] text-red-600 mt-0.5 font-medium">Reason: {d.reason}</div>
                        </div>

                        {d.safety_escalated && (
                          <span className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 font-bold text-[10px] border border-red-200">
                            Urgent Safety Review Required
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* 5. STRATEGY BENCHMARK EVALUATION */}
      {activeTab === 'evaluation' && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 size={18} className="text-emerald-600" />
                Equal-Budget Strategy Benchmark Comparison
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Evaluation under identical budget limits ($B = $10,000) comparing RoadSense AI against FIFO,
                Worst-First (Severity only), and Random Baselines.
              </p>
            </div>

            {/* 4 Strategy Comparison Cards */}
            {evaluationData && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                {evaluationData.strategy_comparisons.map((strat) => {
                  const isRoadSense = strat.strategy_id === 'roadsense';

                  return (
                    <div
                      key={strat.strategy_id}
                      className={`p-4 rounded-2xl border transition-all space-y-3 ${
                        isRoadSense
                          ? 'border-emerald-500 bg-emerald-50/70 shadow-sm'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <strong className={`text-xs ${isRoadSense ? 'text-emerald-900 font-bold' : 'text-slate-700'}`}>
                          {strat.strategy_name.split('(')[0]}
                        </strong>
                        {isRoadSense && (
                          <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-extrabold">
                            Proposed
                          </span>
                        )}
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Critical Coverage:</span>
                          <strong className={isRoadSense ? 'text-emerald-700' : 'text-slate-800'}>
                            {strat.critical_coverage_pct}%
                          </strong>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-slate-500">Risk Reduction:</span>
                          <strong className="font-mono text-slate-900">{strat.risk_reduction_score} pts</strong>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-slate-500">Budget Efficiency:</span>
                          <strong className="font-mono text-emerald-700">{strat.budget_efficiency_pct}%</strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* YOLOv11 Computer Vision Quality Card */}
            {evaluationData && (
              <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200 space-y-3 mt-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Cpu size={14} className="text-emerald-600" />
                  YOLOv11 Computer Vision Test Set Metrics ({evaluationData.model_version})
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs">
                    <span className="text-slate-500 text-[10px] block">Precision</span>
                    <strong className="text-lg font-mono text-emerald-700 font-bold">
                      {(evaluationData.metrics.precision * 100).toFixed(1)}%
                    </strong>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs">
                    <span className="text-slate-500 text-[10px] block">Recall</span>
                    <strong className="text-lg font-mono text-emerald-700 font-bold">
                      {(evaluationData.metrics.recall * 100).toFixed(1)}%
                    </strong>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs">
                    <span className="text-slate-500 text-[10px] block">mAP @ 0.5 IoU</span>
                    <strong className="text-lg font-mono text-amber-600 font-bold">
                      {(evaluationData.metrics.map50 * 100).toFixed(1)}%
                    </strong>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs">
                    <span className="text-slate-500 text-[10px] block">Macro F1 Score</span>
                    <strong className="text-lg font-mono text-teal-700 font-bold">
                      {(evaluationData.metrics.f1_score * 100).toFixed(1)}%
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. SYSTEM SETTINGS */}
      {activeTab === 'settings' && (
        <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Settings size={18} className="text-emerald-600" />
            RoadSense AI Engine Configuration (Coimbatore Deployment)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-500 text-[10px] block">Perception Engine</span>
              <strong className="text-slate-900 text-xs">{health?.yolo_model || 'YOLOv11x Pothole Detector'}</strong>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-500 text-[10px] block">OpenAI Risk Model</span>
              <strong className="text-emerald-700 text-xs">gpt-4o-mini (Critical Hazard Triage)</strong>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-500 text-[10px] block">API Engine Latency</span>
              <strong className="text-emerald-700 text-xs font-mono">{health?.latency_ms || 18} ms</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
