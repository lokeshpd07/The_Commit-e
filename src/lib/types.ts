export type UserRole = 'citizen' | 'admin';

export type RoadClass = 'Residential' | 'Collector' | 'Major Arterial' | 'Highway / Transit';
export type TrafficLevel = 'Low' | 'Moderate' | 'Heavy' | 'Severe';
export type CriticalFacility = 'None' | 'Nearby School' | 'Hospital / Emergency Route' | 'Transit Hub';

export type PriorityBand = 'Critical' | 'High' | 'Medium' | 'Low';
export type ReportStatus =
  | 'Submitted'
  | 'Under Triage'
  | 'Scheduled'
  | 'Crew Dispatched'
  | 'Resolved'
  | 'In progress'
  | 'Reported'
  | 'Pending';

export interface FactorBreakdown {
  severity_score: number; // S (0-100)
  traffic_score: number; // T (0-100)
  road_importance_score: number; // R (0-100)
  criticality_score: number; // C (0-100)
  urgency_score: number; // U (0-100)
  weights: {
    s: number; // 0.35
    t: number; // 0.25
    r: number; // 0.15
    c: number; // 0.15
    u: number; // 0.10
  };
}

export interface DetectionResult {
  class_name: string;
  confidence: number;
  bbox?: number[] | undefined;
  bbox_area_ratio?: number | undefined;
}

export interface ReportItem {
  id: string;
  report_id: string;
  reference: string;
  user_id: string | null;
  user_name?: string | undefined;
  user_role?: UserRole | undefined;
  location: string;
  road_name: string;
  road_class: RoadClass;
  traffic_level: TrafficLevel;
  critical_facility: CriticalFacility;
  description: string;
  severity: number; // 1 = Low, 2 = Moderate, 3 = High/Critical
  severity_label: 'Low' | 'Moderate' | 'High';
  priority_score: number; // 0 - 100
  priority_band: PriorityBand;
  factors: FactorBreakdown;
  status: ReportStatus;
  latitude: number;
  longitude: number;
  photo_url?: string | null | undefined;
  photo_path?: string | null | undefined;
  estimated_cost: number;
  estimated_hours: number;
  team: string | null;
  cluster_id: number; // DBSCAN cluster id (-1 = noise / isolated)
  cluster_name?: string | undefined;
  linked_complaints_count: number;
  is_demo: boolean;
  safety_override: boolean;
  created_at: string;
  updated_at?: string | undefined;
  detections?: DetectionResult[] | undefined;

  // Rich Multi-Modal & OpenAI Triage Fields
  depth_inches?: number | undefined;
  diameter_feet?: number | undefined;
  accidents_count?: number | undefined;
  is_critical?: boolean | undefined;
  ai_triage_justification?: string | undefined;
  recommended_action?: string | undefined;
  recommended_crew?: string | undefined;
  ai_assessed?: boolean | undefined;

  // Compatibility aliases
  priority?: number | undefined;
  source?: string | undefined;
  criticality?: number | undefined;
}

export interface CreateComplaintInput {
  image?: File | null | undefined;
  latitude: number;
  longitude: number;
  road_name?: string | undefined;
  road_class?: RoadClass | undefined;
  traffic_level?: TrafficLevel | undefined;
  critical_facility?: CriticalFacility | undefined;
  observed_severity?: number | undefined;
  severity?: number | undefined;
  criticality?: number | undefined;
  description?: string | undefined;
  user_id?: string | undefined;
  user_name?: string | undefined;
  source?: string | undefined;

  // Pothole Physical Details & Accident History
  depth_inches?: number | undefined;
  diameter_feet?: number | undefined;
  accidents_count?: number | undefined;
}

export interface CreateReportRequest extends CreateComplaintInput {}

export interface CreateReportResponse {
  report_id: string;
  id: string;
  priority_score: number;
  priority_band: PriorityBand;
  is_critical?: boolean | undefined;
  ai_triage_justification?: string | undefined;
  recommended_action?: string | undefined;
  factors: FactorBreakdown;
  detections: DetectionResult[];
  status: string;
  created_at: string;
  // Compatibility properties
  severity?: number | string | undefined;
  is_demo?: boolean | undefined;
  message?: string | undefined;
  latitude: number;
  longitude: number;
  estimated_cost: number;
  estimated_hours: number;
}

export interface MaintenancePlanConstraints {
  budget_limit: number;
  crew_hours_capacity: number;
  strategy?: 'roadsense' | 'worst_first' | 'fifo' | 'random' | undefined;
}

export interface MaintenancePlanResult {
  strategy_id: string;
  budget_limit: number;
  crew_hours_capacity: number;
  total_cost: number;
  total_hours: number;
  budget_utilization: number;
  crew_utilization: number;
  total_risk_reduced: number;
  critical_cases_covered: number;
  total_critical_cases: number;
  critical_coverage_pct: number;
  selected_jobs: ReportItem[];
  deferred_jobs: DeferredJob[];
  // Compatibility properties
  selected_items?: ReportItem[] | undefined;
  deferred_items?: DeferredJob[] | undefined;
}

export interface PlanConstraints extends MaintenancePlanConstraints {}
export interface MaintenancePlanResponse extends MaintenancePlanResult {}

export interface DeferredJob {
  item: ReportItem;
  reason: string;
  safety_escalated?: boolean | undefined;
}

export interface EvaluationStrategyMetric {
  strategy_id: string;
  strategy_name: string;
  critical_coverage_pct: number;
  risk_reduction_score: number;
  budget_efficiency_pct: number;
  total_jobs_completed: number;
}

export interface EvaluationData {
  model_version: string;
  policy_version: string;
  metrics: {
    precision: number;
    recall: number;
    map50: number;
    f1_score: number;
    dataset_size: number;
  };
  strategy_comparisons: EvaluationStrategyMetric[];
  // Compatibility properties
  available?: boolean | undefined;
  message?: string | undefined;
  last_evaluated_at?: string | undefined;
  dataset_stats: {
    total_images: number;
    annotated_potholes: number;
    training_split: string;
    validation_split: string;
    sample_count: number;
  };
}

export interface EvaluationSummaryResponse extends EvaluationData {}

export interface HealthResponse {
  status: string;
  database: string;
  yolo_model?: string | undefined;
  mode?: string | undefined;
  latency_ms?: number | undefined;
  version?: string | undefined;
}

export interface SystemHealth extends HealthResponse {}

export interface MapPoint {
  id: string;
  latitude: number;
  longitude: number;
  severity: number;
  priority_score: number;
  priority_band: PriorityBand;
  road_name: string;
  status: ReportStatus;
}
