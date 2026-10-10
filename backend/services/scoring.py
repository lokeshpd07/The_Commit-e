"""
backend/services/scoring.py
---------------------------
Deterministic priority scoring engine for RoadSense AI.

Policy version: 1.0.0 (prototype — not a validated public-safety standard)

Formula
-------
  priority_score = 0.35*S + 0.25*T + 0.15*R + 0.15*C + 0.10*U

Factor weights are intentionally declared as module-level constants so that a
policy change is a one-line diff with a clear audit trail.

Factor mappings
---------------
All categorical inputs are mapped via fixed lookup tables.  Unrecognised values
raise a ValueError rather than silently defaulting to zero, which would hide
data-quality problems.  Only `complaint_count` has a documented default of 0
because it is genuinely optional information.

Urgency calculation
-------------------
  time_component   = min(days_since_report * 2, 70)   (max 70 pts from waiting time)
  complaint_bonus  = min(complaint_count   * 5, 30)   (max 30 pts from complaints)
  U                = time_component + complaint_bonus  (0–100, naturally capped)

Determinism guarantee
---------------------
No random numbers, no batch normalisation, no global mutable state.  The same
ScoringInput always produces the same PriorityAssessment.

Assumptions documented here (not hidden):
1. `damage_severity` == "none" is a valid submission; score = 0 and category = Low.
2. A `days_since_report` of 0 yields U = 0 (no urgency from time).
3. `complaint_count` defaults to 0 when not supplied by the caller.
"""

from __future__ import annotations

import logging
from typing import Final

from backend.core.config import settings
from backend.schemas.priority import (
    AssessmentMode,
    FactorValues,
    PriorityAssessment,
    PriorityCategory,
    ScoringInput,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Policy version (bump this whenever the formula or mappings change)
# ---------------------------------------------------------------------------

POLICY_VERSION: Final[str] = settings.POLICY_VERSION

# ---------------------------------------------------------------------------
# Factor weights  (must sum to 1.0)
# ---------------------------------------------------------------------------

W_SEVERITY: Final[float] = 0.35
W_TRAFFIC: Final[float] = 0.25
W_ROAD: Final[float] = 0.15
W_CRITICAL: Final[float] = 0.15
W_URGENCY: Final[float] = 0.10

_WEIGHT_SUM: Final[float] = (
    W_SEVERITY + W_TRAFFIC + W_ROAD + W_CRITICAL + W_URGENCY
)
assert abs(_WEIGHT_SUM - 1.0) < 1e-9, f"Weights must sum to 1.0; got {_WEIGHT_SUM}"

# ---------------------------------------------------------------------------
# Lookup tables
# (keys are lower-cased at runtime for robustness)
# ---------------------------------------------------------------------------

SEVERITY_MAP: Final[dict[str, float]] = {
    "none": 0.0,
    "minor": 25.0,
    "moderate": 50.0,
    "severe": 75.0,
    "critical": 100.0,
}

TRAFFIC_MAP: Final[dict[str, float]] = {
    "very_low": 0.0,
    "low": 25.0,
    "medium": 50.0,
    "high": 75.0,
    "very_high": 100.0,
}

ROAD_TYPE_MAP: Final[dict[str, float]] = {
    "residential": 20.0,
    "collector": 40.0,
    "arterial": 60.0,
    "primary": 80.0,
    "highway": 100.0,
}

FACILITY_MAP: Final[dict[str, float]] = {
    "none": 0.0,
    "low": 25.0,
    "medium": 50.0,
    "high": 75.0,
    "critical": 100.0,
}

# Urgency sub-formula constants
_URGENCY_TIME_SCALE: Final[float] = 2.0    # points per day (max 35 days to cap)
_URGENCY_TIME_CAP: Final[float] = 70.0
_URGENCY_COMPLAINT_SCALE: Final[float] = 5.0  # points per complaint
_URGENCY_COMPLAINT_CAP: Final[float] = 30.0

# ---------------------------------------------------------------------------
# Priority category thresholds
# ---------------------------------------------------------------------------

CATEGORY_THRESHOLDS: Final[dict[str, float]] = {
    "critical": 80.0,
    "high": 60.0,
    "medium": 35.0,
    # anything below 35 → low
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _lookup(table: dict[str, float], key: str, field_name: str) -> tuple[float, list[str]]:
    """
    Look up *key* in *table* (case-insensitive).

    Returns
    -------
    (score, uncertainty_flags)
        score            – 0–100 float
        uncertainty_flags – non-empty only when the value was missing/unknown
    """
    normalised = key.strip().lower()
    if normalised not in table:
        valid = ", ".join(sorted(table.keys()))
        raise ValueError(
            f"Invalid value '{key}' for field '{field_name}'. "
            f"Valid values: [{valid}]."
        )
    return table[normalised], []


def _compute_urgency(
    days_since_report: int,
    complaint_count: int,
) -> float:
    """
    Compute the urgency factor U (0–100).

    time_component  = min(days_since_report * 2, 70)
    complaint_bonus = min(complaint_count   * 5, 30)
    U               = time_component + complaint_bonus
    """
    time_component = min(days_since_report * _URGENCY_TIME_SCALE, _URGENCY_TIME_CAP)
    complaint_bonus = min(complaint_count * _URGENCY_COMPLAINT_SCALE, _URGENCY_COMPLAINT_CAP)
    return time_component + complaint_bonus


def _categorise(score: float) -> PriorityCategory:
    """Map a 0–100 priority score to its category."""
    if score >= CATEGORY_THRESHOLDS["critical"]:
        return PriorityCategory.CRITICAL
    if score >= CATEGORY_THRESHOLDS["high"]:
        return PriorityCategory.HIGH
    if score >= CATEGORY_THRESHOLDS["medium"]:
        return PriorityCategory.MEDIUM
    return PriorityCategory.LOW


def _build_explanation(
    category: PriorityCategory,
    factors: FactorValues,
    score: float,
    uncertainty_flags: list[str],
) -> str:
    """Generate a concise, deterministic explanation string."""
    dominant = max(
        [
            ("severity", factors.severity),
            ("traffic exposure", factors.traffic_exposure),
            ("road importance", factors.road_importance),
            ("critical-facility proximity", factors.critical_facility),
            ("urgency", factors.urgency),
        ],
        key=lambda x: x[1],
    )
    lines = [
        f"Priority score {score:.1f}/100 → {category.value.upper()} priority. "
        f"Dominant factor: {dominant[0]} ({dominant[1]:.1f}/100)."
    ]
    if uncertainty_flags:
        lines.append(f"Assumptions applied: {len(uncertainty_flags)} flag(s) — review uncertainty_flags.")
    return " ".join(lines)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


class ScoringService:
    """
    Stateless deterministic scoring engine.

    Usage::

        service = ScoringService()
        assessment = service.score(scoring_input)

    The service holds no mutable state; a single instance can serve the entire
    application lifetime without thread-safety concerns.
    """

    def score(self, inp: ScoringInput) -> PriorityAssessment:
        """
        Compute a deterministic priority assessment from validated inputs.

        Raises
        ------
        ValueError
            If any categorical input maps to an unknown value.
        """
        uncertainty_flags: list[str] = []

        # --- Factor S: damage severity ---
        S, flags = _lookup(SEVERITY_MAP, inp.damage_severity, "damage_severity")
        uncertainty_flags.extend(flags)

        # --- Factor T: traffic exposure ---
        T, flags = _lookup(TRAFFIC_MAP, inp.traffic_volume, "traffic_volume")
        uncertainty_flags.extend(flags)

        # --- Factor R: road importance ---
        R, flags = _lookup(ROAD_TYPE_MAP, inp.road_type, "road_type")
        uncertainty_flags.extend(flags)

        # --- Factor C: critical-facility criticality ---
        C, flags = _lookup(FACILITY_MAP, inp.critical_facility_proximity, "critical_facility_proximity")
        uncertainty_flags.extend(flags)

        # --- Factor U: urgency ---
        U = _compute_urgency(inp.days_since_report, inp.complaint_count)

        # --- Weighted sum ---
        raw_score = (
            W_SEVERITY * S
            + W_TRAFFIC * T
            + W_ROAD * R
            + W_CRITICAL * C
            + W_URGENCY * U
        )
        # Clamp to [0, 100] as a safety net (formula should never exceed 100 given
        # valid inputs, but defensive programming prevents surprising edge cases)
        priority_score = max(0.0, min(100.0, raw_score))

        factor_values = FactorValues(
            severity=S,
            traffic_exposure=T,
            road_importance=R,
            critical_facility=C,
            urgency=U,
        )

        category = _categorise(priority_score)
        explanation = _build_explanation(category, factor_values, priority_score, uncertainty_flags)

        logger.debug(
            "Scored report %s: score=%.2f category=%s mode=deterministic",
            inp.report_id,
            priority_score,
            category.value,
        )

        return PriorityAssessment(
            report_id=inp.report_id,
            priority_score=round(priority_score, 4),
            priority_category=category,
            factor_values=factor_values,
            explanation=explanation,
            uncertainty_flags=uncertainty_flags,
            policy_version=POLICY_VERSION,
            assessment_mode=AssessmentMode.DETERMINISTIC,
        )


# Module-level singleton — import this in other modules
scoring_service = ScoringService()
