import { describe, it, expect, beforeEach } from 'vitest';
import { mockApi, clearAllReports } from '@/lib/mock_api';
import { apiClient } from '@/lib/api_client';
import { calculateFactorScores } from '@/lib/mock_api';

describe('Complete End-to-End Workflow Verification', () => {
  beforeEach(() => {
    // 1. Initial State: Erase all data so system starts completely fresh
    clearAllReports();
  });

  it('Step 1: Confirms zero initial data across all feeds before registration', async () => {
    const initialReports = await apiClient.getReports();
    expect(initialReports).toEqual([]);
    expect(initialReports.length).toBe(0);

    const initialMapPoints = await apiClient.getMapPoints();
    expect(initialMapPoints).toEqual([]);
  });

  it('Step 2: Simulates Citizen Complaint Registration with Coimbatore data & physical crater measurements', async () => {
    // Register a serious pothole on Trichy Road (CMCH Emergency Corridor), Coimbatore
    const newComplaint = await apiClient.createReport({
      latitude: 11.0022,
      longitude: 76.9691,
      road_name: 'Trichy Road (CMCH Emergency Corridor)',
      road_class: 'Major Arterial',
      traffic_level: 'Severe',
      critical_facility: 'Hospital / Emergency Route',
      observed_severity: 3,
      depth_inches: 4.5,
      diameter_feet: 3.0,
      accidents_count: 2,
      user_name: 'Resident Citizen',
      description: 'Severe deep crater right on the CMCH hospital ambulance route causing severe vehicle bottoming.',
    });

    expect(newComplaint).toBeDefined();
    expect(newComplaint.report_id).toMatch(/^#CCMC-/);
    expect(newComplaint.priority_score).toBeGreaterThanOrEqual(80);
    expect(newComplaint.priority_band).toBe('Critical');
    expect(newComplaint.is_critical).toBe(true);
    expect(newComplaint.ai_triage_justification).toBeDefined();

    // Verify exactly ONE complaint exists now in the system
    const activeReports = await apiClient.getReports();
    expect(activeReports.length).toBe(1);
    expect(activeReports[0].report_id).toBe(newComplaint.report_id);
    expect(activeReports[0].road_name).toBe('Trichy Road (CMCH Emergency Corridor)');
    expect(activeReports[0].status).toBe('Submitted');
    expect(activeReports[0].depth_inches).toBe(4.5);
    expect(activeReports[0].diameter_feet).toBe(3.0);
  });

  it('Step 3: Confirms Complaint History contains only the registered complaint', async () => {
    // Create complaint
    const created = await apiClient.createReport({
      latitude: 11.0284,
      longitude: 77.0125,
      road_name: 'Avinashi Road (Peelamedu)',
      road_class: 'Highway / Transit',
      traffic_level: 'Heavy',
      critical_facility: 'Transit Hub',
      observed_severity: 2,
      depth_inches: 2.5,
      diameter_feet: 2.0,
      accidents_count: 0,
      user_name: 'Resident Citizen',
      description: 'Active crater in bus lane near college.',
    });

    const allReports = await apiClient.getReports();
    // Filter history for the resident
    const history = allReports.filter(
      (r) => r.user_name === 'Resident Citizen' || r.report_id === created.report_id
    );

    expect(history.length).toBe(1);
    expect(history[0].report_id).toBe(created.report_id);
    expect(history[0].road_name).toBe('Avinashi Road (Peelamedu)');
    expect(history[0].status).toBe('Submitted');
  });

  it('Step 4: Confirms Admin Portal sees ONLY registered complaints with no extra demo things', async () => {
    // 0 reports initially
    let adminViewReports = await apiClient.getReports();
    expect(adminViewReports.length).toBe(0);

    // Resident submits exactly one complaint
    const complaint = await apiClient.createReport({
      latitude: 11.0183,
      longitude: 76.9654,
      road_name: 'Gandhipuram (Cross Cut Road)',
      road_class: 'Major Arterial',
      traffic_level: 'Severe',
      critical_facility: 'Transit Hub',
      observed_severity: 3,
      depth_inches: 4.0,
      diameter_feet: 2.5,
      accidents_count: 1,
      user_name: 'Citizen Submitter',
      description: 'Dangerous pothole at busy intersection.',
    });

    // Admin queries active reports
    adminViewReports = await apiClient.getReports();
    // Admin must see ONLY that 1 registered complaint - NO extra demo data
    expect(adminViewReports.length).toBe(1);
    expect(adminViewReports[0].report_id).toBe(complaint.report_id);
    expect(adminViewReports[0].road_name).toBe('Gandhipuram (Cross Cut Road)');

    // Admin updates status to 'Scheduled'
    const updated = await apiClient.updateReportStatus(complaint.report_id, 'Scheduled', 'CCMC Rapid Unit #1');
    expect(updated.status).toBe('Scheduled');
    expect(updated.team).toBe('CCMC Rapid Unit #1');

    // Admin re-queries: still exactly 1 complaint
    const refreshed = await apiClient.getReports();
    expect(refreshed.length).toBe(1);
    expect(refreshed[0].status).toBe('Scheduled');
  });

  it('Step 5: Verifies Purge / Erase Demo Data leaves portal with 0 records', async () => {
    await apiClient.createReport({
      latitude: 11.0086,
      longitude: 76.9507,
      road_name: 'RS Puram (DB Road)',
      observed_severity: 1,
      depth_inches: 1.5,
      diameter_feet: 1.0,
      user_name: 'Tester',
    });

    expect((await apiClient.getReports()).length).toBe(1);

    // Call clearAllReports
    await apiClient.clearAllReports();

    // Verify completely empty
    expect((await apiClient.getReports()).length).toBe(0);
  });
});
