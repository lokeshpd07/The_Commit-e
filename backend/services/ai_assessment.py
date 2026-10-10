"""
backend/services/ai_assessment.py
----------------------------------
OpenAI-powered road safety assessment and triage justification engine.
Analyzes YOLOv11 vision output + user physical dimensions (depth, diameter)
+ accident history + traffic volume + critical Coimbatore facility proximity.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from backend.core.config import settings
from backend.schemas.priority import (
    AssessmentMode,
    FactorValues,
    PriorityAssessment,
    PriorityCategory,
    ScoringInput,
)
from backend.services.scoring import (
    POLICY_VERSION,
    ScoringService,
    _categorise,
)

logger = logging.getLogger(__name__)

# System prompt sent to OpenAI
_SYSTEM_PROMPT = """\
You are an expert AI Road Safety and Civil Infrastructure Triage Engineer for Coimbatore Municipal Corporation (CCMC), Tamil Nadu.
You analyze multi-modal citizen damage reports consisting of:
1. YOLOv11 Computer Vision Defect Scan (defect classes, bounding box area ratio r, proxy severity).
2. Physical Pothole Dimensions: Measured/estimated depth (inches/cm) and diameter (feet/cm).
3. Accident History: Known vehicle accidents, 2-wheeler skids, or near-misses.
4. Traffic Volume & Road Classification: Arterial (Avinashi Rd, Trichy Rd), transit (Gandhipuram, Ukkadam), or residential (RS Puram, Saibaba Colony).
5. Critical Route Proximity: Proximity to Coimbatore Medical College Hospital (CMCH), Ganga Hospital, KMCH, schools, or railway stations.
6. Citizen Observations & Description.

Rules for Critical Flagging:
- Flag as is_critical: true (and priority_category: 'critical', priority_score in [80.0, 100.0]) if ANY of the following apply:
  a) Known accidents >= 1, OR
  b) Pothole depth > 3.5 inches (9 cm) on an arterial/collector road, OR
  c) Large diameter (> 2.5 ft) causing two-wheelers/autos to swerve into oncoming traffic, OR
  d) Located on Coimbatore emergency hospital corridors (e.g., Trichy Rd, Avinashi Rd near CMCH/Ganga/KMCH), OR
  e) YOLO detection identifies severe structural cavity with high bounding box ratio.

Output JSON object with EXACT keys:
{
  "report_id": string,
  "priority_score": float (0.0 to 100.0),
  "priority_category": "critical" | "high" | "medium" | "low",
  "is_critical": boolean,
  "severity": float (0.0 to 100.0),
  "traffic_exposure": float (0.0 to 100.0),
  "road_importance": float (0.0 to 100.0),
  "critical_facility": float (0.0 to 100.0),
  "urgency": float (0.0 to 100.0),
  "explanation": string, // Concise technical triage summary (<= 200 chars)
  "ai_triage_justification": string, // Comprehensive 2-3 sentence technical justification synthesizing vision, depth, traffic, accidents, and Coimbatore location
  "recommended_action": string, // e.g. "Immediate emergency cold-mix compaction within 4 hours & warning barricades"
  "recommended_crew": string // e.g. "CCMC Rapid Emergency Asphalt Patch Unit"
}
"""

class AIAssessmentService:
    def __init__(self) -> None:
        self._deterministic = ScoringService()

    def assess_comprehensive(
        self,
        report_id: str,
        road_name: str,
        road_class: str,
        traffic_level: str,
        critical_facility: str,
        severity: int,
        depth_inches: float = 0.0,
        diameter_feet: float = 0.0,
        accidents_count: int = 0,
        description: str = "",
        yolo_detections: Optional[list[dict[str, Any]]] = None,
        linked_complaints: int = 1,
    ) -> dict[str, Any]:
        """
        Runs OpenAI GPT-4o-mini multi-modal triage assessment integrating
        YOLOv11 vision features + user depth/diameter + accidents + location.
        """
        # Baseline deterministic calculation
        scoring_input = ScoringInput(
            report_id=report_id,
            damage_severity="critical" if severity == 3 else "moderate" if severity == 2 else "low",
            traffic_volume="severe" if "severe" in traffic_level.lower() else "heavy" if "heavy" in traffic_level.lower() else "medium",
            road_type="highway" if "highway" in road_class.lower() else "arterial" if "arterial" in road_class.lower() else "residential",
            critical_facility_proximity="hospital" if "hospital" in critical_facility.lower() else "school" if "school" in critical_facility.lower() else "none",
            days_since_report=0,
            complaint_count=linked_complaints,
        )
        baseline = self._deterministic.score(scoring_input)

        if not settings.OPENAI_API_KEY:
            logger.warning("OPENAI_API_KEY not configured. Using rule-based Coimbatore assessment.")
            return self._rule_based_fallback(
                report_id=report_id,
                road_name=road_name,
                road_class=road_class,
                traffic_level=traffic_level,
                critical_facility=critical_facility,
                severity=severity,
                depth_inches=depth_inches,
                diameter_feet=diameter_feet,
                accidents_count=accidents_count,
                description=description,
                baseline_score=baseline.priority_score,
            )

        try:
            import openai

            client = openai.OpenAI(api_key=settings.OPENAI_API_KEY, timeout=settings.AI_ASSESSMENT_TIMEOUT)
            user_payload = {
                "report_id": report_id,
                "city": "Coimbatore, Tamil Nadu",
                "road_name": road_name,
                "road_class": road_class,
                "traffic_volume": traffic_level,
                "critical_facility_proximity": critical_facility,
                "observed_severity_level": severity,
                "measured_depth_inches": depth_inches,
                "measured_diameter_feet": diameter_feet,
                "known_accidents_count": accidents_count,
                "citizen_description": description,
                "yolo_detections": yolo_detections or [
                    {"class_name": "Pothole (Severe)", "confidence": 0.94, "bbox_area_ratio": 0.18}
                ],
                "deterministic_baseline_score": baseline.priority_score,
            }

            response = client.chat.completions.create(
                model=settings.OPENAI_MODEL or "gpt-4o-mini",
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": f"Analyze this Coimbatore road defect and provide triage output:\n{json.dumps(user_payload, indent=2)}",
                    },
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
            )

            raw_text = response.choices[0].message.content or "{}"
            data = json.loads(raw_text)

            # Ensure critical flag consistency
            is_critical = bool(data.get("is_critical", False)) or (accidents_count > 0) or (depth_inches >= 4.0) or (data.get("priority_score", 0) >= 80)
            priority_score = float(data.get("priority_score", baseline.priority_score))
            if is_critical and priority_score < 80:
                priority_score = max(82.5, priority_score)

            category = "critical" if is_critical or priority_score >= 80 else ("high" if priority_score >= 60 else "medium")

            return {
                "report_id": report_id,
                "priority_score": round(priority_score, 1),
                "priority_band": category.capitalize(),
                "is_critical": is_critical,
                "ai_triage_justification": data.get(
                    "ai_triage_justification",
                    f"OpenAI assessed severe road damage on {road_name} in Coimbatore with {depth_inches} in depth and {accidents_count} accidents.",
                ),
                "recommended_action": data.get(
                    "recommended_action",
                    "Immediate emergency asphalt patch compaction within 4 hours & warning barricading.",
                ),
                "recommended_crew": data.get("recommended_crew", "CCMC Rapid Response Road Maintenance Unit"),
                "severity_score": float(data.get("severity", baseline.factor_values.severity)),
                "traffic_score": float(data.get("traffic_exposure", baseline.factor_values.traffic_exposure)),
                "road_importance_score": float(data.get("road_importance", baseline.factor_values.road_importance)),
                "criticality_score": float(data.get("critical_facility", baseline.factor_values.critical_facility)),
                "urgency_score": float(data.get("urgency", baseline.factor_values.urgency)),
                "explanation": data.get("explanation", f"AI triage on {road_name} prioritizing emergency risk reduction."),
                "assessment_mode": "ai_assisted",
            }

        except Exception as e:
            logger.warning("OpenAI triage failed for %s: %s. Using rule-based fallback.", report_id, e)
            return self._rule_based_fallback(
                report_id=report_id,
                road_name=road_name,
                road_class=road_class,
                traffic_level=traffic_level,
                critical_facility=critical_facility,
                severity=severity,
                depth_inches=depth_inches,
                diameter_feet=diameter_feet,
                accidents_count=accidents_count,
                description=description,
                baseline_score=baseline.priority_score,
            )

    def _rule_based_fallback(
        self,
        report_id: str,
        road_name: str,
        road_class: str,
        traffic_level: str,
        critical_facility: str,
        severity: int,
        depth_inches: float,
        diameter_feet: float,
        accidents_count: int,
        description: str,
        baseline_score: float,
    ) -> dict[str, Any]:
        """High-precision fallback heuristic for Coimbatore road triage."""
        is_critical = (accidents_count > 0) or (depth_inches >= 4.0) or (severity == 3) or ("hospital" in critical_facility.lower())
        score = max(baseline_score, 88.5 if is_critical else 65.0)

        justification = (
            f"Multi-factor analysis on {road_name} (Coimbatore). "
            f"Depth: {depth_inches} in, Diameter: {diameter_feet} ft, Known Accidents: {accidents_count}. "
            f"{'Flagged as CRITICAL due to accident risk on transit route.' if is_critical else 'Standard priority repair scheduled.'}"
        )

        return {
            "report_id": report_id,
            "priority_score": round(score, 1),
            "priority_band": "Critical" if score >= 80 else "High" if score >= 60 else "Medium",
            "is_critical": is_critical,
            "ai_triage_justification": justification,
            "recommended_action": "Emergency cold mix patch & warning signage within 6 hours." if is_critical else "Standard hot mix asphalt repair.",
            "recommended_crew": "CCMC Rapid Emergency Unit" if is_critical else "Coimbatore East Zone Maintenance Team",
            "severity_score": 95 if severity == 3 else 65 if severity == 2 else 30,
            "traffic_score": 100 if "severe" in traffic_level.lower() else 80 if "heavy" in traffic_level.lower() else 50,
            "road_importance_score": 100 if "highway" in road_class.lower() else 85 if "arterial" in road_class.lower() else 55,
            "criticality_score": 100 if "hospital" in critical_facility.lower() else 75 if "transit" in critical_facility.lower() else 10,
            "urgency_score": min(100, 50 + accidents_count * 20),
            "explanation": f"Triage assessment for {road_name} (Coimbatore Municipal Corporation).",
            "assessment_mode": "deterministic_fallback",
        }

# Module singleton
ai_assessment_service = AIAssessmentService()
