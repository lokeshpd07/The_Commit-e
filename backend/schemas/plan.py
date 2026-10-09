"""
backend/schemas/plan.py
-----------------------
Pydantic request/response schemas for the planning and evaluation APIs.

Design decisions
----------------
* All cost and duration fields include an "_is_estimate" companion boolean so
  API consumers can distinguish caller-supplied data from planner-generated
  estimates.
* Deferred jobs include a machine-readable deferral_reason string and a
  human-readable description.
* Urgent-unselected jobs are surfaced as a top-level list (not buried in
  deferred_jobs) to ensure they are visible in dashboards and alerts.
* Evaluation metrics that require ground-truth data are represented with a
  nullable float and an explicit "unavailable" status rather than silence or
  invented values.
"""

from __future__ import annotations

# Re-export the shared error envelope so route files can import it from here.

from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from backend.schemas.priority import APIError as APIError  # noqa: F401


# ---------------------------------------------------------------------------
# Map-points schemas
# ---------------------------------------------------------------------------


class MapPointResponse(BaseModel):
    """A single road-damage point suitable for map rendering."""

    report_id: str = Field(..., description="Stable identifier for the damage report.")
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees.")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees.")
    priority_category: str = Field(
        ..., description="Priority tier: critical | high | medium | low."
    )
    priority_score: float = Field(
        ..., ge=0.0, le=100.0, description="Weighted priority score (0–100)."
    )
    status: str = Field(
        default="pending",
        description="Current repair status, e.g. pending | in_progress | completed.",
    )

    model_config = {"populate_by_name": True}


class MapPointsResponse(BaseModel):
    """Paginated list of map points."""

    data: list[MapPointResponse]
    total: int = Field(..., ge=0)

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Planning request
# ---------------------------------------------------------------------------


class PlanRequest(BaseModel):
    """
    Request body for POST /api/v1/plans.

    budget_limit and crew_hour_limit must both be strictly positive.
    max_jobs is optional; when omitted the planner applies no job-count cap.
    """

    budget_limit: float = Field(
        ...,
        gt=0,
        description="Maximum total estimated spend (currency units). Must be positive.",
    )
    crew_hour_limit: float = Field(
        ...,
        gt=0,
        description="Maximum total estimated crew-hours. Must be positive.",
    )
    max_jobs: int | None = Field(
        default=None,
        gt=0,
        description="Optional cap on number of selected jobs.",
    )
    category_filter: str | None = Field(
        default=None,
        description="If set, restrict candidates to this priority category.",
    )

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Planning response sub-schemas
# ---------------------------------------------------------------------------


class SelectedJobResponse(BaseModel):
    """A job selected by the planner."""

    candidate_id: str
    priority_score: float = Field(..., ge=0.0, le=100.0)
    priority_category: str
    estimated_cost: float = Field(..., ge=0.0)
    cost_is_estimate: bool
    estimated_crew_hours: float = Field(..., ge=0.0)
    duration_is_estimate: bool
    estimated_benefit: float = Field(..., ge=0.0)
    is_urgent: bool
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


class DeferredJobResponse(BaseModel):
    """A job deferred by the planner, with reason."""

    candidate_id: str
    priority_score: float = Field(..., ge=0.0, le=100.0)
    priority_category: str
    is_urgent: bool
    deferral_reason: str = Field(
        ...,
        description=(
            "Machine-readable reason: exceeds_remaining_budget | "
            "exceeds_remaining_crew_hours | exceeds_remaining_budget_and_crew_hours | "
            "job_limit_reached"
        ),
    )
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


class PlanResponse(BaseModel):
    """
    Full plan response from POST /api/v1/plans.

    selected_jobs:
        Jobs accepted into the plan (all resource constraints satisfied).
    deferred_jobs:
        Jobs not selected, each with an explicit deferral reason.
    urgent_unselected:
        Urgent deferred jobs requiring immediate manual review.
    total_estimated_cost:
        Summed estimated cost of selected jobs only.
    total_estimated_crew_hours:
        Summed estimated crew-hours of selected jobs only.
    budget_limit / crew_hour_limit:
        The constraints applied to this plan run.
    planner_mode / planner_version:
        Algorithm identifier and semantic version.
    disclaimer:
        Human-readable caveat about heuristic limitations.
    """

    selected_jobs: list[SelectedJobResponse]
    deferred_jobs: list[DeferredJobResponse]
    urgent_unselected: list[DeferredJobResponse]
    total_estimated_cost: float
    total_estimated_crew_hours: float
    budget_limit: float
    crew_hour_limit: float
    max_jobs: int | None
    planner_mode: str
    planner_version: str
    disclaimer: str

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Evaluation schemas
# ---------------------------------------------------------------------------


class StrategyMetricsResponse(BaseModel):
    """Metrics for a single planning strategy."""

    strategy: str
    n_selected: int = Field(..., ge=0)
    n_deferred: int = Field(..., ge=0)
    total_estimated_cost: float = Field(..., ge=0.0)
    total_estimated_crew_hours: float = Field(..., ge=0.0)
    avg_priority_score_selected: float | None = Field(
        ...,
        description="Mean priority score of selected jobs, or null if none selected.",
    )
    n_critical_selected: int = Field(..., ge=0)
    n_urgent_unselected: int = Field(..., ge=0)
    outcome_metrics_status: str = Field(
        ...,
        description=(
            "\"unavailable\" when ground-truth outcome data does not exist. "
            "Will be \"available\" once a validated outcome dataset is provided."
        ),
    )
    outcome_metrics_note: str

    model_config = {"populate_by_name": True}


class EvaluationSummaryResponse(BaseModel):
    """
    Response from GET /api/v1/evaluation/summary.

    strategies:
        Metrics for each of the four comparison strategies.
    budget_limit / crew_hour_limit:
        The constraints applied to all strategies equally.
    n_candidates:
        Total number of repair candidates in the evaluation pool.
    random_seed:
        Seed used for the Seeded Random strategy.
    data_label:
        "real" or "synthetic" — indicates data provenance.
    disclaimer:
        Caveat about prototype limitations and estimate labelling.
    """

    strategies: dict[str, StrategyMetricsResponse]
    budget_limit: float
    crew_hour_limit: float
    n_candidates: int
    random_seed: int
    data_label: str
    disclaimer: str

    model_config = {"populate_by_name": True}
