import { lazy, Suspense } from 'react';
import { ClientOnly } from '@tanstack/react-router';
import { motion } from 'motion/react';
import {
  ClipboardList,
  TriangleAlert,
  Clock3,
  CircleCheck,
  MapPin,
  Layers,
  ShieldCheck,
  ArrowUpRight,
  ArrowRight,
  SlidersHorizontal,
  Search,
  Loader2,
  Activity,
  Cpu,
  Server,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReportItem, HealthResponse } from '@/lib/types';
import potholeImg from '@/assets/pothole.jpg';

const CityMap = lazy(() => import('../city-map'));

interface OverviewPageProps {
  reports: ReportItem[];
  isLoading: boolean;
  health: HealthResponse | null;
  onNavigate: (view: string) => void;
  onSelectReport: (report: ReportItem) => void;
  onOpenReportModal: () => void;
}

export function OverviewPage({
  reports,
  isLoading,
  health,
  onNavigate,
  onSelectReport,
  onOpenReportModal,
}: OverviewPageProps) {
  const critical = reports.filter((r) => r.severity === 3 && r.status !== 'Resolved').length;
  const inProgress = reports.filter((r) => r.status === 'In progress').length;
  const resolved = reports.filter((r) => r.status === 'Resolved').length;

  const resolutionRate = reports.length ? Math.round((resolved / reports.length) * 100) : 0;
  const recentReports = reports.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* System Connection Badge Bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg border border-border bg-card shadow-sm"
      >
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-foreground">
            <Server className="w-4 h-4 text-primary" />
            Backend API:
          </span>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-medium text-[11px] ${
              health?.status === 'healthy' || health?.status === 'ok'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                health?.status === 'healthy' || health?.status === 'ok'
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-amber-500'
              }`}
            />
            {health ? (health.status === 'healthy' ? 'Connected & Healthy' : health.status) : 'Connecting...'}
          </span>

          <span className="text-muted-foreground hidden sm:inline">•</span>

          <span className="inline-flex items-center gap-1 text-muted-foreground text-[11px]">
            <Cpu className="w-3.5 h-3.5 text-primary" />
            Mode:
            <strong className="text-foreground ml-1">
              {health?.mode === 'mock' ? 'Mock Demo Engine' : 'Live PyTorch Backend'}
            </strong>
          </span>

          {health?.latency_ms !== undefined && (
            <>
              <span className="text-muted-foreground hidden sm:inline">•</span>
              <span className="inline-flex items-center gap-1 text-muted-foreground text-[11px]">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                {health.latency_ms}ms latency
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onNavigate('Settings')}
            className="text-xs h-7 px-2.5 gap-1.5"
          >
            <Activity className="w-3.5 h-3.5 text-primary" />
            API Settings
          </Button>
        </div>
      </motion.div>

      {/* Stats Cards Grid */}
      <section className="stats-grid">
        {[
          {
            label: 'Total Reports',
            value: reports.length,
            icon: ClipboardList,
            type: 'neutral',
            note: 'Community & sensor submitted',
            graph: [14, 18, 15, 27, 22, 35, 31, 44, 39, 52, 48, 60],
          },
          {
            label: 'Critical Attention',
            value: critical,
            icon: TriangleAlert,
            type: 'danger',
            note: 'High severity prioritized triage',
            graph: [12, 20, 17, 25, 23, 37, 30, 42, 35, 38, 25, 28],
          },
          {
            label: 'In Progress',
            value: inProgress,
            icon: Clock3,
            type: 'warning',
            note: 'Maintenance crews dispatched',
            graph: [12, 18, 16, 28, 23, 33, 29, 35, 33, 45, 40, 48],
          },
          {
            label: 'Resolved',
            value: resolved,
            icon: CircleCheck,
            type: 'success',
            note: 'Repaired and restored streets',
            graph: [12, 16, 13, 22, 20, 30, 27, 39, 35, 44, 46, 59],
          },
        ].map((s, i) => (
          <motion.article
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: i * 0.08 }}
            key={s.label}
            className={`stat-card stat-${s.type}`}
          >
            <div className="stat-title">
              {s.label}
              <s.icon size={17} />
            </div>
            <div className="stat-body">
              <strong>{isLoading ? '—' : String(s.value).padStart(2, '0')}</strong>
              <svg viewBox="0 0 120 60" className="sparkline" aria-hidden="true">
                <motion.path
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.2, delay: 0.2 + i * 0.1 }}
                  d={`M ${s.graph.map((v, j) => `${j * 10},${65 - v}`).join(' L ')}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </div>
            <small>{s.note}</small>
          </motion.article>
        ))}
      </section>

      {/* Map & Health Insights Section */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="map-and-insights"
      >
        <div className="map-panel">
          <div className="section-heading">
            <div>
              <h2>On the ground</h2>
              <p>City road damage distribution in real time.</p>
            </div>
            <span className="tiny-tag">
              <span className="live-dot" /> {reports.filter((r) => r.status !== 'Resolved').length} active markers
            </span>
          </div>

          <div className="map-container">
            <ClientOnly fallback={<div className="map-loading">Loading city map…</div>}>
              <Suspense fallback={<div className="map-loading">Loading city map…</div>}>
                <CityMap
                  reports={reports.map((r) => ({
                    ...r,
                    reference: r.report_id || r.reference,
                    priority: r.priority_score || r.priority,
                  }))}
                  onSelect={(r) => onSelectReport(r as unknown as ReportItem)}
                />
              </Suspense>
            </ClientOnly>

            <div className="map-location">
              <span className="map-location-icon">
                <MapPin size={15} />
              </span>
              <div>
                <strong>Bengaluru Central</strong>
                <small>Citywide GIS Coverage</small>
              </div>
            </div>

            <div className="map-legend">
              <span>
                <i className="legend-critical" />
                Critical / High
              </span>
              <span>
                <i className="legend-moderate" />
                Moderate
              </span>
              <span>
                <i className="legend-low" />
                Low
              </span>
            </div>
          </div>
        </div>

        {/* Insights & Gauge Panel */}
        <aside className="insights-panel">
          <div className="section-heading">
            <div>
              <h2>Road health</h2>
              <p>Resolution metrics</p>
            </div>
            <span className="insight-icon">
              <Layers size={17} />
            </span>
          </div>

          <div className="health-score">
            <svg viewBox="0 0 150 150">
              <circle className="gauge-track" cx="75" cy="75" r="62" />
              <circle
                className="gauge-fill"
                cx="75"
                cy="75"
                r="62"
                strokeDasharray={`${reports.length ? (resolved / reports.length) * 390 : 0} 390`}
              />
            </svg>
            <div>
              <strong>
                {resolutionRate}
                <span>%</span>
              </strong>
              <small>Resolution rate</small>
            </div>
          </div>

          <div className="health-caption">
            <span className="live-dot" /> {resolved} reports resolved
          </div>

          <div className="health-breakdown">
            <div>
              <span>
                <i className="legend-critical" />
                High Severity
              </span>
              <strong>
                {reports.filter((r) => r.severity === 3).length}
                <small> reports</small>
              </strong>
            </div>
            <div>
              <span>
                <i className="legend-moderate" />
                Moderate
              </span>
              <strong>
                {reports.filter((r) => r.severity === 2).length}
                <small> reports</small>
              </strong>
            </div>
            <div>
              <span>
                <i className="legend-low" />
                Low Severity
              </span>
              <strong>
                {reports.filter((r) => r.severity === 1).length}
                <small> reports</small>
              </strong>
            </div>
          </div>

          <div className="impact-note cursor-pointer" onClick={onOpenReportModal}>
            <ShieldCheck size={18} />
            <span>Submit new report</span>
            <ArrowUpRight size={15} />
          </div>
        </aside>
      </motion.section>

      {/* Priority Reports Table Section */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="reports-section"
      >
        <div className="section-heading">
          <div className="report-title">
            <h2>Priority Triage Queue</h2>
            <span className="count-chip">{recentReports.length}</span>
            <span className="priority-caption">
              <SlidersHorizontal size={13} /> Ranked by priority score & time
            </span>
          </div>

          <Button variant="ghost" onClick={() => onNavigate('Priorities & Map')}>
            View full priority map <ArrowRight size={14} />
          </Button>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>REPORT / LOCATION</th>
                <th>SEVERITY</th>
                <th>PRIORITY SCORE</th>
                <th>ESTIMATED COST</th>
                <th>EST. HOURS</th>
                <th>STATUS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {recentReports.map((r, i) => (
                <motion.tr
                  key={r.report_id || r.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => onSelectReport(r)}
                  tabIndex={0}
                  onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && onSelectReport(r)}
                >
                  <td>
                    <div className="report-location">
                      <img
                        src={r.photo_url || potholeImg}
                        alt="Pothole damage preview"
                        width={44}
                        height={44}
                        className="rounded object-cover"
                      />
                      <div>
                        <strong>{r.location}</strong>
                        <small>
                          {r.report_id || r.id} <span>·</span> {r.source || 'Community report'}
                          {r.is_demo && <span className="ml-1 text-amber-500 font-medium">(Demo)</span>}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`severity severity-${r.severity}`}>
                      <i />
                      {r.severity_label || (r.severity === 3 ? 'High' : r.severity === 2 ? 'Moderate' : 'Low')}
                    </span>
                  </td>
                  <td>
                    <div className={`priority-score severity-color-${r.severity}`}>
                      <span>{r.priority_score || r.priority}</span>
                      <div className="priority-bars">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <i
                            key={n}
                            className={n <= Math.ceil((r.priority_score ?? r.priority ?? 50) / 20) ? 'filled' : ''}
                          />
                        ))}
                      </div>
                    </div>
                  </td>
                  <td className="font-mono text-xs">${r.estimated_cost?.toLocaleString() || '1,500'}</td>
                  <td className="font-mono text-xs">{r.estimated_hours || 2.0} hrs</td>
                  <td>
                    <span className={`status status-${(r.status || 'reported').toLowerCase().replace(' ', '-')}`}>
                      <i />
                      {r.status}
                    </span>
                  </td>
                  <td>
                    <Button size="icon" variant="ghost" aria-label={`View ${r.report_id}`}>
                      <ArrowUpRight size={16} />
                    </Button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>

          {isLoading && (
            <div className="empty-state">
              <Loader2 className="animate-spin text-primary" size={24} />
              <p>Loading backend priority reports...</p>
            </div>
          )}

          {!isLoading && recentReports.length === 0 && (
            <div className="empty-state">
              <ClipboardList size={28} />
              <h3>No reports found</h3>
              <p>Submit your first report using the button above.</p>
              <Button onClick={onOpenReportModal}>Report a Pothole</Button>
            </div>
          )}
        </div>
      </motion.section>
    </div>
  );
}
