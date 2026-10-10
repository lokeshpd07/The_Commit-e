"""
backend/schemas/priority.py
---------------------------
Pydantic schemas for the priority-scoring subsystem.

Design decisions:
- All public-facing schemas use Field aliases for camelCase JSON keys so that the
  frontend can consume them without a transformation layer.
- "factor_values" exposes the raw 0–100 intermediate scores so clients can build
  their own visualisations without re-running the formula.
- "uncertainty_flags" is a list of human-readable notes (e.g. "traffic_exposure
  defaulted – missing value") so API consumers know where to be cautious.
- AssessmentMode is an enum so comparisons are always safe.

These schemas are *response* contracts.  Internal service objects may use plain
dataclasses or dicts; they are converted at the route boundary.
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class PriorityCategory(str, Enum):
    """Priority tier.  Boundaries are a prototype policy, not safety standards."""

    CRITICAL = "critical"   # score >= 80
    HIGH = "high"           # score >= 60 and < 80
    MEDIUM = "medium"       # score >= 35 and < 60
    LOW = "low"             # score < 35


class AssessmentMode(str, Enum):
    """Records which engine produced the final priority score."""

    DETERMINISTIC = "deterministic"
    AI_ASSISTED = "ai_assisted"


# ---------------------------------------------------------------------------
# Factor-value sub-schema
# ---------------------------------------------------------------------------


class FactorValues(BaseModel):
    """The five 0–100 normalised factor scores that feed the priority formula."""

    severity: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Damage severity score S (0–100).",
    )
    traffic_exposure: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Traffic exposure score T (0–100).",
    )
    road_importance: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Road importance score R (0–100).",
    )
    critical_facility: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Critical-facility criticality score C (0–100).",
    )
    urgency: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Urgency score U (0–100), combining waiting time and complaint history.",
    )

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Input schema (used by the scoring service, not directly exposed in the API)
# ---------------------------------------------------------------------------


class ScoringInput(BaseModel):
    """
    Raw feature values submitted to the scoring engine.

    Documented factor mappings (prototype policy v1.0.0)
    =====================================================

    damage_severity (str)
        "none"        →  0
        "minor"       → 25
        "moderate"    → 50
        "severe"      → 75
        "critical"    → 100
        Unknown value → ValidationError (not silently mapped to 0)

    traffic_volume (str)
        "very_low"    →  0
        "low"         → 25
        "medium"      → 50
        "high"        → 75
        "very_high"   → 100
        Unknown value → ValidationError

    road_type (str)
        "residential" → 20
        "collector"   → 40
        "arterial"    → 60
        "primary"     → 80
        "highway"     → 100
        Unknown value → ValidationError

    critical_facility_proximity (str)
        "none"        →  0
        "low"         → 25
        "medium"      → 50
        "high"        → 75
        "critical"    → 100
        Unknown value → ValidationError

    days_since_report (int, >= 0)
        Raw waiting days; urgency score = min(days_since_report * 2, 70) + complaint_bonus

    complaint_count (int, >= 0)
        Number of complaints; bonus = min(complaint_count * 5, 30)

    All fields are REQUIRED unless marked Optional; missing required fields raise
    a ValidationError rather than being silently defaulted.
    """

    report_id: str = Field(..., description="Stable identifier for the damage report.")

    # Raw categorical inputs
    damage_severity: str = Field(..., description="Categorical damage severity.")
    traffic_volume: str = Field(..., description="Categorical traffic volume.")
    road_type: str = Field(..., description="Categorical road type.")
    critical_facility_proximity: str = Field(
        ..., description="Categorical proximity to critical facilities."
    )

    # Urgency inputs
    days_since_report: int = Field(
        ..., ge=0, description="Number of days the report has been open."
    )
    complaint_count: int = Field(
        default=0, ge=0, description="Number of complaints filed for this report."
    )

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Priority assessment response schemas
# ---------------------------------------------------------------------------


class PriorityAssessment(BaseModel):
    """
    Full priority assessment for a single damage report.

    Disclaimer: priority scores are prototype policy outputs; they do NOT
    constitute validated public-safety certifications.
    """

    report_id: str = Field(..., description="Stable identifier for the damage report.")
    priority_score: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Weighted priority score (0–100).",
    )
    priority_category: PriorityCategory = Field(
        ..., description="Derived priority tier."
    )
    factor_values: FactorValues = Field(
        ..., description="Intermediate 0–100 scores for each factor."
    )
    explanation: str = Field(
        ..., description="Concise human-readable explanation of the priority decision."
    )
    uncertainty_flags: list[str] = Field(
        default_factory=list,
        description="Notes about missing data or assumptions made during scoring.",
    )
    policy_version: str = Field(
        ..., description="Scoring policy version that produced this assessment."
    )
    assessment_mode: AssessmentMode = Field(
        ..., description="Engine that produced this assessment."
    )

    model_config = {"populate_by_name": True, "use_enum_values": True}


# ---------------------------------------------------------------------------
# API request/response envelopes for GET /api/v1/priorities
# ---------------------------------------------------------------------------


class PriorityListItem(BaseModel):
    """Lightweight summary row returned in paginated list responses."""

    report_id: str
    priority_score: float = Field(ge=0.0, le=100.0)
    priority_category: PriorityCategory
    assessment_mode: AssessmentMode
    policy_version: str
    explanation: str

    model_config = {"populate_by_name": True, "use_enum_values": True}


class PaginationMeta(BaseModel):
    """Pagination metadata included in every list response."""

    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=200)
    total_items: int = Field(ge=0)
    total_pages: int = Field(ge=0)


class PriorityListResponse(BaseModel):
    """Paginated list of priority assessments."""

    data: list[PriorityListItem]
    meta: PaginationMeta

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Standard API error envelope (shared contract)
# ---------------------------------------------------------------------------


class APIError(BaseModel):
    """Standard error envelope returned by all error responses."""

    error: str = Field(..., description="Machine-readable error code.")
    message: str = Field(..., description="Human-readable error message.")
    details: dict[str, Any] | None = Field(
        default=None, description="Optional structured detail payload."
    )
