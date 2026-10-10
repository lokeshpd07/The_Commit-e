"""
backend/api/routes/plans.py
----------------------------
POST /api/v1/plans — resource-constrained maintenance planning.

Design decisions
----------------
* The planner is driven entirely by the assessment repository.  Candidates are
  fetched in score-descending order (up to 500 at a time) so the planner sees
  all available records without excessive memory usage.
* No SQL is written here; all data access goes through the AssessmentRepository
  protocol injected via Depends.
* A minimal PlanRepository protocol is defined here for plan persistence;
  Member 1 is expected to provide the concrete implementation.  Until then, an
  InMemoryPlanRepository is used as a fallback.
* Plan runs are persisted (attempt-only; persistence failures are non-fatal so
  the caller still receives the plan result).
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from typing import Annotated, Any, Protocol, runtime_checkable

from fastapi import APIRouter, Depends, HTTPException, Query, status

from backend.core.repository_interface import (
    AssessmentRepository,
    InMemoryAssessmentRepository,
)
from backend.schemas.plan import (
    APIError,
    DeferredJobResponse,
    PlanRequest,
    PlanResponse,
    SelectedJobResponse,
)
from backend.services.planner import (
    RepairCandidate,
    maintenance_planner,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/plans", tags=["plans"])

# ---------------------------------------------------------------------------
# Plan repository interface (thin persistence for plan runs)
# ---------------------------------------------------------------------------


@dataclass
class PlanRunRecord:
    """Minimal persisted record of a plan run (for audit / history)."""

    run_id: str
    budget_limit: float
    crew_hour_limit: float
    n_selected: int
    n_deferred: int
    total_estimated_cost: float
    total_estimated_crew_hours: float
    planner_mode: str
    planner_version: str
    raw_payload: dict = field(default_factory=dict)


@runtime_checkable
class PlanRepository(Protocol):
    """Minimal persistence interface for plan run records."""

    def save_run(self, record: PlanRunRecord) -> PlanRunRecord:
        """Persist a plan run and return it."""
        ...


class InMemoryPlanRepository:
    """In-memory fallback satisfying PlanRepository (tests and dev only)."""

    def __init__(self) -> None:
        self._store: dict[str, PlanRunRecord] = {}

    def save_run(self, record: PlanRunRecord) -> PlanRunRecord:
        self._store[record.run_id] = record
        return record


_fallback_assessment_repo: InMemoryAssessmentRepository = InMemoryAssessmentRepository()
_fallback_plan_repo: InMemoryPlanRepository = InMemoryPlanRepository()


def get_assessment_repository() -> AssessmentRepository:
    """FastAPI dependency for the assessment repository."""
    try:
        from backend.repositories.assessment import assessment_repository  # type: ignore[import]
        return assessment_repository  # type: ignore[return-value]
    except ImportError:
        return _fallback_assessment_repo


def get_plan_repository() -> PlanRepository:
    """
    FastAPI dependency for the plan-run repository.

    Tries Member 1's concrete implementation first; falls back to in-memory.
    """
    try:
        from backend.repositories.plans import plan_repository  # type: ignore[import]
        return plan_repository  # type: ignore[return-value]
    except ImportError:
        return _fallback_plan_repo


AssessmentRepoDep = Annotated[AssessmentRepository, Depends(get_assessment_repository)]
PlanRepoDep = Annotated[PlanRepository, Depends(get_plan_repository)]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_FETCH_PAGE_SIZE = 500  # max candidates fetched from repository


def _record_to_candidate(record) -> RepairCandidate:
    """Convert an AssessmentRecord to a RepairCandidate."""
    return RepairCandidate(
        candidate_id=record.report_id,
        priority_score=record.priority_score,
        priority_category=record.priority_category,
        # Costs/durations not in AssessmentRecord → planner uses demo estimates
        estimated_cost=None,
        estimated_crew_hours=None,
        is_urgent=(record.priority_category.lower() == "critical"),
        report_date_iso=None,
        metadata={
            "assessment_mode": record.assessment_mode,
            "policy_version": record.policy_version,
        },
    )


# ---------------------------------------------------------------------------
# POST /api/v1/plans
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=PlanResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate a resource-constrained maintenance plan",
    description=(
        "Fetches all scored damage reports from the repository, applies the "
        "greedy priority-first planner within the supplied budget and crew-hour "
        "limits, and returns selected/deferred jobs with deferral reasons.  "
        "Cost and duration values are estimates.  Urgent unselected jobs are "
        "highlighted for manual review.  "
        "The planner is a heuristic and does NOT guarantee a globally optimal plan."
    ),
    responses={
        422: {"model": APIError, "description": "Invalid request body"},
        500: {"model": APIError, "description": "Internal server error"},
    },
)
def create_plan(
    plan_request: PlanRequest,
    assessment_repo: AssessmentRepoDep,
    plan_repo: PlanRepoDep,
) -> PlanResponse:
    """Generate a maintenance plan and persist the run record."""

    # Fetch candidates from repository
    try:
        page_result = assessment_repo.list_assessments(
            page=1,
            page_size=_FETCH_PAGE_SIZE,
            category_filter=plan_request.category_filter,
        )
    except Exception as exc:
        logger.exception("Repository error fetching candidates for plan: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "repository_error",
                "message": "Failed to retrieve candidates for planning.",
            },
        ) from exc

    candidates = [_record_to_candidate(r) for r in page_result.items]

    # Run planner
    try:
        plan = maintenance_planner.plan(
            candidates=candidates,
            budget_limit=plan_request.budget_limit,
            crew_hour_limit=plan_request.crew_hour_limit,
            max_jobs=plan_request.max_jobs,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "invalid_plan_request", "message": str(exc)},
        ) from exc
    except Exception as exc:
        logger.exception("Planner error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "planner_error", "message": "Unexpected error during planning."},
        ) from exc

    # Attempt to persist the plan run (non-fatal on failure)
    run_id = str(uuid.uuid4())
    try:
        plan_repo.save_run(
            PlanRunRecord(
                run_id=run_id,
                budget_limit=plan_request.budget_limit,
                crew_hour_limit=plan_request.crew_hour_limit,
                n_selected=len(plan.selected_jobs),
                n_deferred=len(plan.deferred_jobs),
                total_estimated_cost=plan.total_estimated_cost,
                total_estimated_crew_hours=plan.total_estimated_crew_hours,
                planner_mode=plan.planner_mode,
                planner_version=plan.planner_version,
                raw_payload={"run_id": run_id},
            )
        )
        logger.info("Plan run %s persisted.", run_id)
    except Exception as exc:
        logger.warning("Failed to persist plan run %s: %s", run_id, exc)
        # Non-fatal: return plan result regardless

    # Map to response schema
    selected = [
        SelectedJobResponse(
            candidate_id=j.candidate_id,
            priority_score=j.priority_score,
            priority_category=j.priority_category,
            estimated_cost=j.estimated_cost,
            cost_is_estimate=j.cost_is_estimate,
            estimated_crew_hours=j.estimated_crew_hours,
            duration_is_estimate=j.duration_is_estimate,
            estimated_benefit=j.estimated_benefit,
            is_urgent=j.is_urgent,
            metadata=j.metadata,
        )
        for j in plan.selected_jobs
    ]

    deferred = [
        DeferredJobResponse(
            candidate_id=d.candidate_id,
            priority_score=d.priority_score,
            priority_category=d.priority_category,
            is_urgent=d.is_urgent,
            deferral_reason=d.deferral_reason,
            metadata=d.metadata,
        )
        for d in plan.deferred_jobs
    ]

    urgent_unselected = [
        DeferredJobResponse(
            candidate_id=d.candidate_id,
            priority_score=d.priority_score,
            priority_category=d.priority_category,
            is_urgent=d.is_urgent,
            deferral_reason=d.deferral_reason,
            metadata=d.metadata,
        )
        for d in plan.urgent_unselected
    ]

    return PlanResponse(
        selected_jobs=selected,
        deferred_jobs=deferred,
        urgent_unselected=urgent_unselected,
        total_estimated_cost=plan.total_estimated_cost,
        total_estimated_crew_hours=plan.total_estimated_crew_hours,
        budget_limit=plan.budget_limit,
        crew_hour_limit=plan.crew_hour_limit,
        max_jobs=plan.max_jobs,
        planner_mode=plan.planner_mode,
        planner_version=plan.planner_version,
        disclaimer=plan.disclaimer,
    )

