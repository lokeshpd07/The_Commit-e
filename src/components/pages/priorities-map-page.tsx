import { useState, lazy, Suspense } from 'react';
import { ClientOnly } from '@tanstack/react-router';
import { motion } from 'motion/react';
import {
  Search,
  Filter,
  SlidersHorizontal,
  MapPin,
  ArrowUpRight,
  ClipboardList,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReportItem } from '@/lib/types';
import potholeImg from '@/assets/pothole.jpg';

const CityMap = lazy(() => import('../city-map'));

interface PrioritiesMapPageProps {
  reports: ReportItem[];
  isLoading: boolean;
  onSelectReport: (report: ReportItem) => void;
  onRefresh: () => void;
}

export function PrioritiesMapPage({
  reports,
  isLoading,
  onSelectReport,
  onRefresh,
}: PrioritiesMapPageProps) {
  const [statusFilter, setStatusFilter] = useState('All');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [search, setSearch] = useState('');

  // Filter & deterministic ordering: priority score descending, then created_at ascending
  const filteredReports = reports
    .filter((r) => {
      if (statusFilter !== 'All' && r.status.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }
      if (severityFilter !== 'All') {
        const targetSev = severityFilter === 'High' ? 3 : severityFilter === 'Moderate' ? 2 : 1;
        if (r.severity !== targetSev) return false;
      }
      if (search.trim()) {
        const query = search.toLowerCase();
        const loc = (r.location || '').toLowerCase();
        const road = (r.road_name || '').toLowerCase();
        const id = (r.report_id || r.id || '').toLowerCase();
        if (!loc.includes(query) && !road.includes(query) && !id.includes(query)) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => b.priority_score - a.priority_score || a.created_at.localeCompare(b.created_at));

  return (
    <div className="space-y-6">
      {/* Page Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-card border border-border rounded-lg p-5 shadow-sm">
        <div>
          <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Section 3.3 • Priorities & GIS Map
          </div>
          <h2 className="text-xl font-bold text-foreground">Priority Triage & Geospatial View</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            View priority-ranked damage reports and map markers from <code className="bg-secondary px-1 py-0.5 rounded text-foreground">GET /api/v1/priorities</code> and <code className="bg-secondary px-1 py-0.5 rounded text-foreground">GET /api/v1/map-points</code>.
          </p>
        </div>

        <Button size="sm" variant="outline" onClick={onRefresh} className="text-xs gap-1.5">
          <RefreshCw className="w-3.5 h-3.5 text-primary" /> Refresh GIS Points
        </Button>
      </div>

      {/* Map Section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-lg p-4 shadow-sm space-y-3"
      >
        <div className="flex items-center justify-between text-xs">
          <div className="font-semibold text-foreground flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" /> Interactive City GIS Map
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> High Severity
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Moderate
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Low Severity
            </span>
          </div>
        </div>

        <div className="map-container h-[360px] rounded-md overflow-hidden border border-border relative">
          <ClientOnly fallback={<div className="map-loading">Loading Map...</div>}>
            <Suspense fallback={<div className="map-loading">Loading Map...</div>}>
              <CityMap
                reports={filteredReports.map((r) => ({
                  ...r,
                  reference: r.report_id || r.reference,
                  priority: r.priority_score || r.priority,
                }))}
                onSelect={(r) => onSelectReport(r as unknown as ReportItem)}
              />
            </Suspense>
          </ClientOnly>

          <div className="absolute top-3 left-3 bg-card/90 backdrop-blur-sm px-3 py-1.5 rounded border border-border text-[11px] shadow-sm flex items-center gap-2 z-[1000]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Showing <strong>{filteredReports.length}</strong> active map points
          </div>
        </div>
      </motion.div>

      {/* Priority Table Section */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-lg p-5 shadow-sm space-y-4"
      >
        {/* Table Toolbar & Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 bg-secondary p-1 rounded-md overflow-x-auto">
            {['All', 'Reported', 'Pending', 'Scheduled', 'In progress', 'Resolved'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Severity Dropdown & Search Bar */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 border border-border px-2.5 py-1.5 rounded bg-background">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="bg-transparent text-foreground text-xs focus:outline-none"
              >
                <option value="All">All Severities</option>
                <option value="High">High Severity (3)</option>
                <option value="Moderate">Moderate (2)</option>
                <option value="Low">Low Severity (1)</option>
              </select>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search road or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 border border-border rounded bg-background text-foreground text-xs w-44 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* Priority Ranked Table */}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>REPORT ID / ROAD</th>
                <th>SEVERITY</th>
                <th>PRIORITY SCORE</th>
                <th>ESTIMATED COST</th>
                <th>EST. HOURS</th>
                <th>STATUS</th>
                <th>REPORTED</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((r, i) => (
                <motion.tr
                  key={r.report_id || r.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => onSelectReport(r)}
                  className="hover:bg-accent/50 cursor-pointer"
                >
                  <td>
                    <div className="report-location">
                      <img
                        src={r.photo_url || potholeImg}
                        alt="Pothole preview"
                        width={40}
                        height={40}
                        className="rounded object-cover"
                      />
                      <div>
                        <strong>{r.location || r.road_name}</strong>
                        <small>
                          {r.report_id || r.id} <span>·</span> {r.source || 'Community'}
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
                      <span className="font-bold">{r.priority_score || r.priority}</span>
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
                  <td className="text-muted-foreground text-xs">
                    {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </td>
                  <td>
                    <Button size="icon" variant="ghost" aria-label="View report">
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
              <p>Loading priority reports...</p>
            </div>
          )}

          {!isLoading && filteredReports.length === 0 && (
            <div className="empty-state">
              <ClipboardList size={28} />
              <h3>No matching priority reports</h3>
              <p>Try adjusting your search query or filter settings above.</p>
            </div>
          )}
        </div>

        <div className="text-[11px] text-muted-foreground flex justify-between pt-2">
          <span>Showing {filteredReports.length} of {reports.length} reports</span>
          <span>Deterministically ordered: Priority Score ↓ then Created Date ↑</span>
        </div>
      </motion.div>
    </div>
  );
}
