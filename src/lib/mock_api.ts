import {
  ReportItem,
  CreateReportRequest,
  CreateReportResponse,
  MaintenancePlanResponse,
  EvaluationSummaryResponse,
  HealthResponse,
  MapPoint,
  FactorBreakdown,
  RoadClass,
  TrafficLevel,
  CriticalFacility,
  PriorityBand,
  ReportStatus,
} from './types';

// Deterministic Multi-Factor Scoring Formula:
// P = 0.35*S + 0.25*T + 0.15*R + 0.15*C + 0.10*U + Depth & Accident modifiers
export function calculateFactorScores(params: {
  severity: number | string;
  traffic_level?: TrafficLevel | string | undefined;
  road_class?: RoadClass | string | undefined;
  critical_facility?: CriticalFacility | string | undefined;
  linked_complaints?: number | undefined;
  created_at?: string | undefined;
  safety_override?: boolean | undefined;
  depth_inches?: number | undefined;
  diameter_feet?: number | undefined;
  accidents_count?: number | undefined;
}): { priority_score: number; priority_band: PriorityBand; factors: FactorBreakdown; is_critical: boolean } {
  // 1. Severity Score S (35%)
  let s = 65;
  if (typeof params.severity === 'number') {
    if (params.severity === 3) s = 95;
    else if (params.severity === 2) s = 65;
    else s = 30;
  } else if (typeof params.severity === 'string') {
    const sev = params.severity.toLowerCase();
    if (sev.includes('high') || sev.includes('critical') || sev === '3') s = 95;
    else if (sev.includes('mod') || sev === '2') s = 65;
    else s = 30;
  }

  // Adjust Severity by measured depth
  if (params.depth_inches !== undefined) {
    if (params.depth_inches >= 4.5) s = Math.max(s, 95);
    else if (params.depth_inches >= 3.0) s = Math.max(s, 75);
    else if (params.depth_inches >= 1.5) s = Math.max(s, 50);
  }

  // 2. Traffic Score T (25%)
  let t = 50;
  const traffic = (params.traffic_level || 'Moderate').toLowerCase();
  if (traffic.includes('severe') || traffic.includes('peak')) t = 100;
  else if (traffic.includes('heavy')) t = 80;
  else if (traffic.includes('mod')) t = 50;
  else if (traffic.includes('low')) t = 20;

  // 3. Road Class Importance R (15%)
  let r = 55;
  const road = (params.road_class || 'Collector').toLowerCase();
  if (road.includes('highway') || road.includes('transit')) r = 100;
  else if (road.includes('arterial')) r = 85;
  else if (road.includes('collector')) r = 55;
  else if (road.includes('residential')) r = 25;

  // 4. Criticality Score C (15%)
  let c = 10;
  const facility = (params.critical_facility || 'None').toLowerCase();
  if (facility.includes('hospital') || facility.includes('emergency') || facility.includes('cmch')) c = 100;
  else if (facility.includes('transit') || facility.includes('bus') || facility.includes('metro') || facility.includes('railway')) c = 75;
  else if (facility.includes('school')) c = 60;
  else c = 10;

  // 5. Urgency Score U (10%) - accounts for linked reports & known accidents
  const count = params.linked_complaints || 1;
  const accidents = params.accidents_count || 0;
  let daysWaiting = 0;
  if (params.created_at) {
    const diffMs = Date.now() - new Date(params.created_at).getTime();
    daysWaiting = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }
  const u = Math.min(100, Math.max(10, 20 + 15 * (count - 1) + 4 * daysWaiting + 20 * accidents));

  let rawP = 0.35 * s + 0.25 * t + 0.15 * r + 0.15 * c + 0.10 * u;
  if (params.safety_override) {
    rawP = 100;
  }

  const priority_score = Math.min(100, Math.max(0, Math.round(rawP * 10) / 10));

  // Determine Critical Flag (accidents >= 1, depth > 4in, emergency route, or score >= 80)
  const is_critical =
    accidents > 0 ||
    (params.depth_inches !== undefined && params.depth_inches >= 4.0) ||
    facility.includes('hospital') ||
    priority_score >= 80 ||
    !!params.safety_override;

  let priority_band: PriorityBand = 'Low';
  if (priority_score >= 80 || is_critical) priority_band = 'Critical';
  else if (priority_score >= 60) priority_band = 'High';
  else if (priority_score >= 35) priority_band = 'Medium';

  return {
    priority_score: is_critical && priority_score < 80 ? Math.max(82.0, priority_score) : priority_score,
    priority_band,
    is_critical,
    factors: {
      severity_score: s,
      traffic_score: t,
      road_importance_score: r,
      criticality_score: c,
      urgency_score: u,
      weights: {
        s: 0.35,
        t: 0.25,
        r: 0.15,
        c: 0.15,
        u: 0.10,
      },
    },
  };
}

// Initial Fresh Reports Store (0 prior demo data)
export const MOCK_REPORTS: ReportItem[] = [];

let mockReportsStore: ReportItem[] = [];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockApi = {
  async getHealth(): Promise<HealthResponse> {
    await delay(120);
    return {
      status: 'healthy',
      database: 'Supabase Cloud (PostgreSQL 15.8)',
      yolo_model: 'YOLOv11x Defect Perception Engine (Coimbatore)',
      mode: 'mock',
      latency_ms: 18,
      version: '2.1.0',
    };
  },

  async getReports(params?: { status?: string; severity?: string | number }): Promise<ReportItem[]> {
    await delay(200);
    let result = [...mockReportsStore];

    if (params?.status && params.status !== 'All reports' && params.status !== 'All') {
      result = result.filter((r) => r.status.toLowerCase() === params.status?.toLowerCase());
    }

    if (params?.severity) {
      const sevNum = Number(params.severity);
      if (!isNaN(sevNum)) {
        result = result.filter((r) => r.severity === sevNum);
      }
    }

    return result.sort((a, b) => b.priority_score - a.priority_score);
  },

  async getReportById(reportId: string): Promise<ReportItem> {
    await delay(150);
    const item = mockReportsStore.find((r) => r.report_id === reportId || r.id === reportId);
    if (!item) {
      throw new Error(`Report '${reportId}' not found.`);
    }
    return item;
  },

  async createReport(data: CreateReportRequest): Promise<CreateReportResponse> {
    await delay(450);

    const severityNum = data.observed_severity || data.severity || 2;
    const severityLabel: 'Low' | 'Moderate' | 'High' =
      severityNum === 3 ? 'High' : severityNum === 2 ? 'Moderate' : 'Low';
    const depth = data.depth_inches !== undefined ? data.depth_inches : severityNum === 3 ? 4.5 : severityNum === 2 ? 2.5 : 1.2;
    const diameter = data.diameter_feet !== undefined ? data.diameter_feet : severityNum === 3 ? 3.0 : severityNum === 2 ? 1.8 : 0.8;
    const accidents = data.accidents_count !== undefined ? data.accidents_count : 0;

    const scoring = calculateFactorScores({
      severity: severityNum,
      traffic_level: data.traffic_level,
      road_class: data.road_class,
      critical_facility: data.critical_facility,
      linked_complaints: 1,
      created_at: new Date().toISOString(),
      depth_inches: depth,
      diameter_feet: diameter,
      accidents_count: accidents,
    });

    const nextNum = mockReportsStore.length + 101;
    const reportId = `#CCMC-${1000 + nextNum}`;

    const costMap: Record<number, number> = { 1: 850, 2: 1800, 3: 3200 };
    const hoursMap: Record<number, number> = { 1: 1.2, 2: 2.5, 3: 4.5 };
    const estimatedCost = costMap[severityNum] || 1800;
    const estimatedHours = hoursMap[severityNum] || 2.5;

    // DBSCAN cluster assignment around Coimbatore
    let clusterId = 1;
    let clusterName = 'Avinashi Road Work Zone (Peelamedu)';
    if (data.latitude < 11.01 && data.longitude < 76.96) {
      clusterId = 3;
      clusterName = 'RS Puram & Saibaba Colony Zone';
    } else if (data.latitude > 11.04) {
      clusterId = 4;
      clusterName = 'Saravanampatti IT Corridor Zone';
    }

    const detections = [
      {
        class_name: severityNum === 3 ? 'Pothole (Severe Depth)' : 'Pothole (Moderate)',
        confidence: 0.94 + Math.random() * 0.04,
        bbox: [140, 160, 480, 360],
        bbox_area_ratio: severityNum === 3 ? 0.24 : 0.12,
      },
    ];

    const aiJustification = scoring.is_critical
      ? `OpenAI GPT-4o-mini Triage: FLAGGED AS CRITICAL! Multi-modal scan detected ${severityLabel.toLowerCase()} road hazard on ${data.road_name || 'Coimbatore corridor'} (Depth: ${depth} in, Diameter: ${diameter} ft, Accidents: ${accidents}). Immediate emergency action recommended.`
      : `OpenAI GPT-4o-mini Triage: Routine road defect on ${data.road_name || 'Coimbatore corridor'} (Depth: ${depth} in). Scheduled within standard municipal maintenance cycle.`;

    const newReport: ReportItem = {
      id: reportId,
      report_id: reportId,
      reference: reportId,
      user_id: data.user_id || 'usr_resident_demo',
      user_name: data.user_name || 'Resident Submitter',
      user_role: 'citizen',
      location: data.road_name || `Lat ${data.latitude.toFixed(4)}, Lon ${data.longitude.toFixed(4)}`,
      road_name: data.road_name || 'Avinashi Road, Coimbatore',
      road_class: data.road_class || 'Major Arterial',
      traffic_level: data.traffic_level || 'Heavy',
      critical_facility: data.critical_facility || 'None',
      description: data.description || 'Pothole reported via Coimbatore Citizen Complaint Portal.',
      severity: severityNum,
      severity_label: severityLabel,
      depth_inches: depth,
      diameter_feet: diameter,
      accidents_count: accidents,
      is_critical: scoring.is_critical,
      ai_triage_justification: aiJustification,
      recommended_action: scoring.is_critical
        ? 'Immediate emergency cold-mix compaction & warning barricades within 4 hours.'
        : 'Standard hot-mix asphalt patch repair scheduled.',
      recommended_crew: scoring.is_critical
        ? 'CCMC Rapid Emergency Asphalt Patch Unit'
        : 'CCMC Municipal Road Maintenance Team',
      ai_assessed: true,
      priority_score: scoring.priority_score,
      priority_band: scoring.priority_band,
      factors: scoring.factors,
      status: 'Submitted',
      latitude: data.latitude,
      longitude: data.longitude,
      photo_url: data.image ? URL.createObjectURL(data.image) : null,
      estimated_cost: estimatedCost,
      estimated_hours: estimatedHours,
      team: null,
      cluster_id: clusterId,
      cluster_name: clusterName,
      linked_complaints_count: 1,
      is_demo: true,
      safety_override: false,
      created_at: new Date().toISOString(),
      detections,
    };

    mockReportsStore = [newReport, ...mockReportsStore];

    return {
      report_id: reportId,
      id: reportId,
      priority_score: scoring.priority_score,
      priority_band: scoring.priority_band,
      is_critical: scoring.is_critical,
      ai_triage_justification: aiJustification,
      recommended_action: newReport.recommended_action,
      factors: scoring.factors,
      detections,
      status: 'Submitted',
      created_at: newReport.created_at,
      severity: severityLabel as any,
      is_demo: true,
      message: 'Complaint registered successfully with YOLOv11 and OpenAI triage.',
      latitude: data.latitude,
      longitude: data.longitude,
      estimated_cost: estimatedCost,
      estimated_hours: estimatedHours,
    };
  },

  async updateReportStatus(reportId: string, status: ReportStatus, team?: string): Promise<ReportItem> {
    await delay(150);
    const item = mockReportsStore.find((r) => r.report_id === reportId || r.id === reportId);
    if (!item) {
      throw new Error(`Report '${reportId}' not found.`);
    }
    item.status = status;
    if (team) item.team = team;
    item.updated_at = new Date().toISOString();
    return { ...item };
  },

  async toggleSafetyOverride(reportId: string): Promise<ReportItem> {
    await delay(150);
    const item = mockReportsStore.find((r) => r.report_id === reportId || r.id === reportId);
    if (!item) {
      throw new Error(`Report '${reportId}' not found.`);
    }
    item.safety_override = !item.safety_override;
    if (item.safety_override) {
      item.priority_score = 100.0;
      item.priority_band = 'Critical';
      item.is_critical = true;
    } else {
      const scoring = calculateFactorScores({
        severity: item.severity,
        traffic_level: item.traffic_level,
        road_class: item.road_class,
        critical_facility: item.critical_facility,
        linked_complaints: item.linked_complaints_count,
        created_at: item.created_at,
        depth_inches: item.depth_inches,
        diameter_feet: item.diameter_feet,
        accidents_count: item.accidents_count,
      });
      item.priority_score = scoring.priority_score;
      item.priority_band = scoring.priority_band;
      item.is_critical = scoring.is_critical;
    }
    return { ...item };
  },

  async upvoteComplaint(reportId: string): Promise<ReportItem> {
    await delay(150);
    const item = mockReportsStore.find((r) => r.report_id === reportId || r.id === reportId);
    if (!item) {
      throw new Error(`Report '${reportId}' not found.`);
    }
    item.linked_complaints_count += 1;
    const scoring = calculateFactorScores({
      severity: item.severity,
      traffic_level: item.traffic_level,
      road_class: item.road_class,
      critical_facility: item.critical_facility,
      linked_complaints: item.linked_complaints_count,
      created_at: item.created_at,
      depth_inches: item.depth_inches,
      diameter_feet: item.diameter_feet,
      accidents_count: item.accidents_count,
    });
    item.priority_score = scoring.priority_score;
    item.priority_band = scoring.priority_band;
    item.is_critical = scoring.is_critical;
    item.factors = scoring.factors;
    return { ...item };
  },

  async getMapPoints(): Promise<MapPoint[]> {
    await delay(150);
    return mockReportsStore.map((r) => ({
      id: r.report_id,
      latitude: r.latitude,
      longitude: r.longitude,
      severity: r.severity,
      priority_score: r.priority_score,
      priority_band: r.priority_band,
      road_name: r.road_name,
      status: r.status,
    }));
  },

  async createPlan(constraints: { budget_limit: number; crew_hours_capacity: number }): Promise<MaintenancePlanResponse> {
    await delay(350);
    const reports = [...mockReportsStore].sort((a, b) => b.priority_score - a.priority_score);
    const selected: ReportItem[] = [];
    const deferred: { item: ReportItem; reason: string; safety_escalated?: boolean }[] = [];

    let currentCost = 0;
    let currentHours = 0;

    for (const r of reports) {
      if (currentCost + r.estimated_cost <= constraints.budget_limit && currentHours + r.estimated_hours <= constraints.crew_hours_capacity) {
        selected.push(r);
        currentCost += r.estimated_cost;
        currentHours += r.estimated_hours;
      } else {
        const reason =
          currentCost + r.estimated_cost > constraints.budget_limit
            ? `Exceeds remaining budget ($${(constraints.budget_limit - currentCost).toFixed(0)} left, cost is $${r.estimated_cost})`
            : `Exceeds remaining crew hours (${(constraints.crew_hours_capacity - currentHours).toFixed(1)}h left, needs ${r.estimated_hours}h)`;
        deferred.push({
          item: r,
          reason,
          safety_escalated: r.priority_score >= 80,
        });
      }
    }

    const totalCritical = reports.filter((r) => r.priority_score >= 80).length;
    const criticalCovered = selected.filter((r) => r.priority_score >= 80).length;

    return {
      strategy_id: 'roadsense',
      budget_limit: constraints.budget_limit,
      crew_hours_capacity: constraints.crew_hours_capacity,
      total_cost: currentCost,
      total_hours: Math.round(currentHours * 10) / 10,
      budget_utilization: Math.round((currentCost / constraints.budget_limit) * 100),
      crew_utilization: Math.round((currentHours / constraints.crew_hours_capacity) * 100),
      total_risk_reduced: Math.round(selected.reduce((acc, r) => acc + r.priority_score, 0) * 10) / 10,
      critical_cases_covered: criticalCovered,
      total_critical_cases: totalCritical,
      critical_coverage_pct: totalCritical > 0 ? Math.round((criticalCovered / totalCritical) * 100) : 100,
      selected_jobs: selected,
      deferred_jobs: deferred,
    };
  },

  async getEvaluationSummary(simulateUnavailable: boolean = false): Promise<EvaluationSummaryResponse> {
    await delay(200);
    if (simulateUnavailable) {
      return {
        available: false,
        message: 'Model evaluation telemetry is temporarily unavailable in offline mode.',
        model_version: 'N/A',
        policy_version: 'N/A',
        dataset_stats: {
          total_images: 0,
          annotated_potholes: 0,
          training_split: '0%',
          validation_split: '0%',
          sample_count: 0,
        },
        metrics: { precision: 0, recall: 0, map50: 0, f1_score: 0, dataset_size: 0 },
        strategy_comparisons: [],
      };
    }
    return {
      available: true,
      model_version: 'YOLOv11x-CCMC-v2.1',
      policy_version: '2.1.0',
      dataset_stats: {
        total_images: 5400,
        annotated_potholes: 12400,
        training_split: '80%',
        validation_split: '20%',
        sample_count: 5400,
      },
      metrics: {
        precision: 0.938,
        recall: 0.912,
        map50: 0.946,
        f1_score: 0.925,
        dataset_size: 5400,
      },
      strategy_comparisons: [
        {
          strategy_id: 'roadsense',
          strategy_name: 'RoadSense AI (Multi-Factor + Knapsack + OpenAI)',
          critical_coverage_pct: 100,
          risk_reduction_score: 348.5,
          budget_efficiency_pct: 96.2,
          total_jobs_completed: 4,
        },
        {
          strategy_id: 'worst_first',
          strategy_name: 'Worst-First (Severity Only Greedy)',
          critical_coverage_pct: 75,
          risk_reduction_score: 281.0,
          budget_efficiency_pct: 88.4,
          total_jobs_completed: 3,
        },
        {
          strategy_id: 'fifo',
          strategy_name: 'FIFO (First-In, First-Out Arbitrary Queue)',
          critical_coverage_pct: 50,
          risk_reduction_score: 194.5,
          budget_efficiency_pct: 79.1,
          total_jobs_completed: 3,
        },
        {
          strategy_id: 'random',
          strategy_name: 'Random Baseline Selection',
          critical_coverage_pct: 25,
          risk_reduction_score: 142.0,
          budget_efficiency_pct: 65.0,
          total_jobs_completed: 2,
        },
      ],
    };
  },

  resetMockStore(): void {
    mockReportsStore = [];
  },

  clearAllReports(): void {
    mockReportsStore = [];
  },
};

export function resetMockStore(): void {
  mockReportsStore = [];
}

export function clearAllReports(): void {
  mockReportsStore = [];
}

