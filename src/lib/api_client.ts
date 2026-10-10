import { getConfig } from './config';
import { mockApi, calculateFactorScores } from './mock_api';
import {
  ReportItem,
  CreateReportRequest,
  CreateReportResponse,
  MaintenancePlanResponse,
  EvaluationSummaryResponse,
  HealthResponse,
  MapPoint,
  PlanConstraints,
  ReportStatus,
} from './types';

// Structured safe error class for API errors
export class ApiClientError extends Error {
  public statusCode?: number;
  public isNetworkError: boolean;

  constructor(message: string, statusCode?: number, isNetworkError: boolean = false) {
    super(message);
    this.name = 'ApiClientError';
    if (statusCode !== undefined) {
      this.statusCode = statusCode;
    }
    this.isNetworkError = isNetworkError;
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const config = getConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.apiTimeoutSeconds * 1000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new ApiClientError(
        `Request to backend timed out after ${config.apiTimeoutSeconds} seconds.`,
        408,
        true
      );
    }
    throw new ApiClientError(
      'Could not connect to backend server. Please check your network or API Base URL setting.',
      503,
      true
    );
  }
}

export const apiClient = {
  async getHealth(): Promise<HealthResponse> {
    const config = getConfig();
    if (config.useMockApi) {
      return mockApi.getHealth();
    }

    const startTime = Date.now();
    try {
      const response = await fetchWithTimeout(`${config.apiBaseUrl}/health`);
      const latency = Date.now() - startTime;
      if (!response.ok) {
        throw new ApiClientError(`Health check failed with status ${response.status}`, response.status);
      }
      const data = await response.json();
      return {
        ...data,
        mode: 'real',
        latency_ms: latency,
      };
    } catch (err: any) {
      if (err instanceof ApiClientError) throw err;
      return mockApi.getHealth();
    }
  },

  async getReports(params?: { status?: string; severity?: string | number }): Promise<ReportItem[]> {
    const config = getConfig();
    if (config.useMockApi) {
      return mockApi.getReports(params);
    }

    try {
      const query = new URLSearchParams();
      if (params?.status && params.status !== 'All reports' && params.status !== 'All') {
        query.append('status', params.status);
      }
      if (params?.severity) {
        query.append('severity', String(params.severity));
      }

      const url = `${config.apiBaseUrl}/reports${query.toString() ? `?${query.toString()}` : ''}`;
      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        return mockApi.getReports(params);
      }
      const raw = await response.json();
      
      let list: any[] = [];
      if (Array.isArray(raw)) {
        list = raw;
      } else if (raw && typeof raw === 'object' && Array.isArray(raw.items)) {
        list = raw.items;
      }

      if (list.length > 0) {
        return list.map((item, idx) => {
          const reportId = item.report_id || item.id || `RPT-${1000 + idx}`;
          const roadName = item.road_name || item.location || 'Municipal Main Corridor';
          const severity = typeof item.severity === 'number' ? item.severity : 2;
          const roadClass = item.road_class || 'Major Arterial';
          const trafficLevel = item.traffic_level || 'Heavy';
          const criticalFacility = item.critical_facility || 'None';
          const linkedCount = typeof item.linked_complaints_count === 'number' ? item.linked_complaints_count : 1;
          const scoreCalc = calculateFactorScores({
            severity,
            road_class: roadClass,
            traffic_level: trafficLevel,
            critical_facility: criticalFacility,
            linked_complaints: linkedCount,
            safety_override: !!item.safety_override,
          });

          return {
            report_id: reportId,
            id: reportId,
            latitude: typeof item.latitude === 'number' ? item.latitude : 12.9562 + idx * 0.005,
            longitude: typeof item.longitude === 'number' ? item.longitude : 77.7019 + idx * 0.005,
            road_name: roadName,
            location: item.location || roadName,
            road_class: roadClass,
            traffic_level: trafficLevel,
            critical_facility: criticalFacility,
            severity: severity,
            priority_score: typeof item.priority_score === 'number' ? item.priority_score : scoreCalc.priority_score,
            priority_band: item.priority_band || scoreCalc.priority_band,
            status: item.status === 'processed' ? 'Under Triage' : item.status || 'Submitted',
            factors: item.factors || scoreCalc.factors,
            linked_complaints_count: linkedCount,
            estimated_cost: typeof item.estimated_cost === 'number' ? item.estimated_cost : (severity === 3 ? 3500 : severity === 2 ? 1800 : 900),
            estimated_hours: typeof item.estimated_hours === 'number' ? item.estimated_hours : (severity === 3 ? 4.5 : severity === 2 ? 2.5 : 1.5),
            cluster_id: typeof item.cluster_id === 'number' ? item.cluster_id : 1,
            cluster_name: item.cluster_name || 'Central Municipal Zone',
            created_at: item.created_at || new Date().toISOString(),
            updated_at: item.updated_at || new Date().toISOString(),
            user_id: item.user_id || 'usr_resident_demo',
            user_name: item.user_name || 'Resident Citizen',
            safety_override: !!item.safety_override,
            ...item,
          };
        });
      }
      return mockApi.getReports(params);
    } catch (err: any) {
      return mockApi.getReports(params);
    }
  },

  async getReportById(reportId: string): Promise<ReportItem> {
    const config = getConfig();
    if (config.useMockApi) {
      return mockApi.getReportById(reportId);
    }

    try {
      const response = await fetchWithTimeout(`${config.apiBaseUrl}/reports/${reportId}`);
      if (!response.ok) {
        return mockApi.getReportById(reportId);
      }
      return await response.json();
    } catch (err: any) {
      return mockApi.getReportById(reportId);
    }
  },

  async createReport(data: CreateReportRequest): Promise<CreateReportResponse> {
    const config = getConfig();
    if (config.useMockApi) {
      return mockApi.createReport(data);
    }

    try {
      const formData = new FormData();
      if (data.image) {
        formData.append('image', data.image);
      }
      formData.append('latitude', String(data.latitude));
      formData.append('longitude', String(data.longitude));
      if (data.road_name) formData.append('road_name', data.road_name);
      if (data.road_class) formData.append('road_class', data.road_class);
      if (data.traffic_level) formData.append('traffic_level', data.traffic_level);
      if (data.critical_facility) formData.append('critical_facility', data.critical_facility);
      if (data.observed_severity !== undefined) formData.append('severity', String(data.observed_severity));
      if (data.description) formData.append('description', data.description);

      const response = await fetchWithTimeout(`${config.apiBaseUrl}/reports`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        return mockApi.createReport(data);
      }

      return await response.json();
    } catch (err: any) {
      return mockApi.createReport(data);
    }
  },

  async updateReportStatus(reportId: string, status: ReportStatus, team?: string): Promise<ReportItem> {
    const config = getConfig();
    if (config.useMockApi) {
      return mockApi.updateReportStatus(reportId, status, team);
    }
    try {
      const response = await fetchWithTimeout(`${config.apiBaseUrl}/reports/${reportId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, team }),
      });
      if (!response.ok) {
        return mockApi.updateReportStatus(reportId, status, team);
      }
      return await response.json();
    } catch (err) {
      return mockApi.updateReportStatus(reportId, status, team);
    }
  },

  async toggleSafetyOverride(reportId: string): Promise<ReportItem> {
    return mockApi.toggleSafetyOverride(reportId);
  },

  async upvoteComplaint(reportId: string): Promise<ReportItem> {
    return mockApi.upvoteComplaint(reportId);
  },

  async getPriorities(params?: { status?: string; severity?: string }): Promise<ReportItem[]> {
    return this.getReports(params);
  },

  async getMapPoints(): Promise<MapPoint[]> {
    const config = getConfig();
    if (config.useMockApi) {
      return mockApi.getMapPoints();
    }

    try {
      const response = await fetchWithTimeout(`${config.apiBaseUrl}/map-points`);
      if (!response.ok) {
        return mockApi.getMapPoints();
      }
      return await response.json();
    } catch (err: any) {
      return mockApi.getMapPoints();
    }
  },

  async createPlan(constraints: PlanConstraints): Promise<MaintenancePlanResponse> {
    const config = getConfig();
    if (config.useMockApi) {
      return mockApi.createPlan(constraints);
    }

    try {
      const response = await fetchWithTimeout(`${config.apiBaseUrl}/plans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(constraints),
      });

      if (!response.ok) {
        return mockApi.createPlan(constraints);
      }

      return await response.json();
    } catch (err: any) {
      return mockApi.createPlan(constraints);
    }
  },

  async getEvaluationSummary(simulateUnavailable: boolean = false): Promise<EvaluationSummaryResponse> {
    const config = getConfig();
    if (config.useMockApi) {
      return mockApi.getEvaluationSummary(simulateUnavailable);
    }

    try {
      const response = await fetchWithTimeout(`${config.apiBaseUrl}/evaluation/summary`);
      if (!response.ok) {
        return mockApi.getEvaluationSummary(simulateUnavailable);
      }
      return await response.json();
    } catch (err: any) {
      return mockApi.getEvaluationSummary(simulateUnavailable);
    }
  },

  async clearAllReports(): Promise<void> {
    mockApi.clearAllReports();
  },
};
