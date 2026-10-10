import { describe, it, expect, beforeEach } from 'vitest';
import { apiClient } from '../lib/api_client';
import { mockApi } from '../lib/mock_api';
import { saveConfig } from '../lib/config';

describe('RoadSense AI Frontend API Client & Mock System', () => {
  beforeEach(() => {
    saveConfig({ useMockApi: true });
    mockApi.resetMockStore();
  });

  it('checks health response in mock mode', async () => {
    const health = await apiClient.getHealth();
    expect(health.status).toBe('healthy');
    expect(health.mode).toBe('mock');
    expect(health.version).toBeDefined();
  });

  it('returns sorted reports by priority score descending', async () => {
    await apiClient.createReport({
      latitude: 11.0284,
      longitude: 77.0125,
      road_name: 'Avinashi Road',
      road_class: 'Highway / Transit',
      traffic_level: 'Severe',
      critical_facility: 'Hospital / Emergency Route',
      observed_severity: 3,
    });
    await apiClient.createReport({
      latitude: 11.0086,
      longitude: 76.9507,
      road_name: 'DB Road',
      road_class: 'Collector',
      traffic_level: 'Low',
      critical_facility: 'None',
      observed_severity: 1,
    });

    const reports = await apiClient.getReports();
    expect(reports.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < reports.length - 1; i++) {
      expect(reports[i]!.priority_score).toBeGreaterThanOrEqual(reports[i + 1]!.priority_score);
    }
  });

  it('submits a new report and returns detection results with priority score', async () => {
    const request = {
      latitude: 11.0183,
      longitude: 76.9654,
      road_name: 'Cross Cut Road',
      road_class: 'Major Arterial' as const,
      traffic_level: 'Heavy' as const,
      critical_facility: 'Transit Hub' as const,
      observed_severity: 3,
      description: 'Test deep pothole',
    };

    const response = await apiClient.createReport(request);
    expect(response.report_id).toMatch(/^(RPT|#CCMC-)/);
    expect(response.severity).toBe('High');
    expect(response.priority_score).toBeGreaterThan(60);
    expect(response.detections.length).toBeGreaterThan(0);
    expect(response.is_demo).toBe(true);

    const updatedReports = await apiClient.getReports();
    expect(updatedReports.some((r) => r.report_id === response.report_id)).toBe(true);
  });

  it('generates a maintenance plan with budget and crew capacity constraints', async () => {
    // Add multiple reports with different costs to test knapsack selection
    await apiClient.createReport({
      latitude: 11.0284,
      longitude: 77.0125,
      road_name: 'Avinashi Road',
      road_class: 'Highway / Transit',
      traffic_level: 'Severe',
      critical_facility: 'Hospital / Emergency Route',
      observed_severity: 3,
    });
    await apiClient.createReport({
      latitude: 11.0022,
      longitude: 76.9691,
      road_name: 'Trichy Road',
      road_class: 'Highway / Transit',
      traffic_level: 'Heavy',
      critical_facility: 'Hospital / Emergency Route',
      observed_severity: 3,
    });
    await apiClient.createReport({
      latitude: 11.0086,
      longitude: 76.9507,
      road_name: 'DB Road',
      road_class: 'Collector',
      traffic_level: 'Low',
      critical_facility: 'None',
      observed_severity: 1,
    });

    const plan = await apiClient.createPlan({
      budget_limit: 3000,
      crew_hours_capacity: 4.0,
    });

    expect(plan.total_cost).toBeLessThanOrEqual(3000);
    expect(plan.total_hours).toBeLessThanOrEqual(4.0);
    expect(plan.selected_jobs.length).toBeGreaterThan(0);
    expect(plan.deferred_jobs.length).toBeGreaterThan(0);

    const deferredReason = plan.deferred_jobs[0]!.reason;
    expect(deferredReason).toMatch(/Exceed/);
  });

  it('fetches evaluation summary metrics', async () => {
    const summary = await apiClient.getEvaluationSummary(false);
    expect(summary.available).toBe(true);
    expect(summary.metrics.precision).toBeGreaterThan(0.8);
    expect(summary.dataset_stats.total_images).toBe(5400);

    const unavailable = await apiClient.getEvaluationSummary(true);
    expect(unavailable.available).toBe(false);
  });
});
