"""
backend/api/routes/priorities.py
---------------------------------
GET /api/v1/priorities — paginated, scored priority queue.

Route design decisions
----------------------
* No SQL is executed here; all data access goes through the AssessmentRepository
  protocol so the route is decoupled from the ORM implementation (Member 1).
* Pagination uses 1-based page numbers to match common REST conventions.
* Sorting is always priority_score DESC; future sort-key support can be added via
  an optional query parameter without breaking existing clients.
* Filters (category, mode) are passed straight through to the repository, which
  may or may not support them — the route itself never filters in Python to avoid
  incorrect total_items counts.
* The repository is injected via FastAPI Depends so tests can swap in an
  InMemoryAssessmentRepository without patching globals.
* Error responses use the shared APIError envelope.

Dependency wiring
-----------------
The `get_repository` dependency tries to import Member 1's concrete repository.
If it is not yet available (e.g. during parallel development) it falls back to
InMemoryAssessmentRepository so routes remain testable.

POST /api/v1/priorities/score
-------------------------------
Convenience endpoint that scores a report on-demand and optionally persists it.
Useful for testing and for the frontend before the full ingestion pipeline is
wired up.
"""

from __future__ import annotations

import logging
import math
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from backend.core.repository_interface import (
    AssessmentRecord,
    AssessmentRepository,
    InMemoryAssessmentRepository,
)
from backend.schemas.priority import (
    APIError,
    AssessmentMode,
    FactorValues,
    PaginationMeta,
    PriorityAssessment,
    PriorityCategory,
    PriorityListItem,
    PriorityListResponse,
    ScoringInput,
)
from backend.services.ai_assessment import ai_assessment_service
from backend.services.scoring import scoring_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/priorities", tags=["priorities"])

# ---------------------------------------------------------------------------
# Repository dependency
# ---------------------------------------------------------------------------

# Shared in-memory store for when the real repository is not yet wired up
_fallback_repo: InMemoryAssessmentRepository = InMemoryAssessmentRepository()


def get_repository() -> AssessmentRepository:
    """
    FastAPI dependency that returns the assessment repository.

    Priority order:
    1. Member 1's concrete SQLAlchemy implementation
       (imported from backend.repositories.assessment)
    2. InMemoryAssessmentRepository (fallback for local dev / tests)
    """
    try:
        from backend.repositories.assessment import assessment_repository  # type: ignore[import]
        return assessment_repository  # type: ignore[return-value]
    except ImportError:
        logger.debug(
            "backend.repositories.assessment not available; "
            "using InMemoryAssessmentRepository fallback."
        )
        return _fallback_repo


RepositoryDep = Annotated[AssessmentRepository, Depends(get_repository)]

# ---------------------------------------------------------------------------
# Helper: convert repository record → Pydantic response model
# ---------------------------------------------------------------------------


def _record_to_list_item(record: AssessmentRecord) -> PriorityListItem:
    return PriorityListItem(
        report_id=record.report_id,
        priority_score=record.priority_score,
        priority_category=PriorityCategory(record.priority_category),
        assessment_mode=AssessmentMode(record.assessment_mode),
        policy_version=record.policy_version,
        explanation=record.explanation,
    )


def _record_to_full_assessment(record: AssessmentRecord) -> PriorityAssessment:
    return PriorityAssessment(
        report_id=record.report_id,
        priority_score=record.priority_score,
        priority_category=PriorityCategory(record.priority_category),
        factor_values=FactorValues(
            severity=record.factor_severity,
            traffic_exposure=record.factor_traffic_exposure,
            road_importance=record.factor_road_importance,
            critical_facility=record.factor_critical_facility,
            urgency=record.factor_urgency,
        ),
        explanation=record.explanation,
        uncertainty_flags=record.uncertainty_flags,
        policy_version=record.policy_version,
        assessment_mode=AssessmentMode(record.assessment_mode),
    )


def _assessment_to_record(assessment: PriorityAssessment) -> AssessmentRecord:
    return AssessmentRecord(
        report_id=assessment.report_id,
        priority_score=assessment.priority_score,
        priority_category=assessment.priority_category.value
        if isinstance(assessment.priority_category, PriorityCategory)
        else assessment.priority_category,
        assessment_mode=assessment.assessment_mode.value
        if isinstance(assessment.assessment_mode, AssessmentMode)
        else assessment.assessment_mode,
        policy_version=assessment.policy_version,
        explanation=assessment.explanation,
        factor_severity=assessment.factor_values.severity,
        factor_traffic_exposure=assessment.factor_values.traffic_exposure,
        factor_road_importance=assessment.factor_values.road_importance,
        factor_critical_facility=assessment.factor_values.critical_facility,
        factor_urgency=assessment.factor_values.urgency,
        uncertainty_flags=assessment.uncertainty_flags,
    )


# ---------------------------------------------------------------------------
# GET /api/v1/priorities
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=PriorityListResponse,
    summary="List road-damage reports ordered by priority score",
    description=(
        "Returns a paginated list of priority assessments sorted by priority_score "
        "descending. Filter by category or assessment mode using query parameters. "
        "Scores are prototype policy outputs — not validated public-safety standards."
    ),
    responses={
        422: {"model": APIError, "description": "Invalid query parameters"},
        500: {"model": APIError, "description": "Internal server error"},
    },
)
def list_priorities(
    repo: RepositoryDep,
    page: Annotated[
        int,
        Query(ge=1, description="1-based page number."),
    ] = 1,
    page_size: Annotated[
        int,
        Query(ge=1, le=200, description="Number of items per page (max 200)."),
    ] = 20,
    category: Annotated[
        str | None,
        Query(
            description=(
                "Filter by priority category. "
                "Valid values: critical, high, medium, low."
            )
        ),
    ] = None,
    mode: Annotated[
        str | None,
        Query(
            description=(
                "Filter by assessment mode. "
                "Valid values: deterministic, ai_assisted."
            )
        ),
    ] = None,
) -> PriorityListResponse:
    """Return a paginated list of priority assessments, sorted by score descending."""

    # Validate filter enums at the route layer to give clear 422 errors
    if category is not None:
        valid_categories = {c.value for c in PriorityCategory}
        if category not in valid_categories:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error": "invalid_filter",
                    "message": f"Invalid category '{category}'. Valid: {sorted(valid_categories)}",
                },
            )

    if mode is not None:
        valid_modes = {m.value for m in AssessmentMode}
        if mode not in valid_modes:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error": "invalid_filter",
                    "message": f"Invalid mode '{mode}'. Valid: {sorted(valid_modes)}",
                },
            )

    try:
        result = repo.list_assessments(
            page=page,
            page_size=page_size,
            category_filter=category,
            mode_filter=mode,
        )
    except Exception as exc:
        logger.exception("Repository error in list_priorities: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "repository_error", "message": "Failed to retrieve assessments."},
        ) from exc

    total_pages = math.ceil(result.total_items / page_size) if result.total_items > 0 else 0

    return PriorityListResponse(
        data=[_record_to_list_item(r) for r in result.items],
        meta=PaginationMeta(
            page=result.page,
            page_size=result.page_size,
            total_items=result.total_items,
            total_pages=total_pages,
        ),
    )


# ---------------------------------------------------------------------------
# GET /api/v1/priorities/{report_id}
# ---------------------------------------------------------------------------


@router.get(
    "/{report_id}",
    response_model=PriorityAssessment,
    summary="Get full priority assessment for a specific report",
    responses={
        404: {"model": APIError, "description": "Report not found"},
        500: {"model": APIError, "description": "Internal server error"},
    },
)
def get_priority(
    report_id: str,
    repo: RepositoryDep,
) -> PriorityAssessment:
    """Return the full priority assessment for a single damage report."""
    try:
        record = repo.get_by_report_id(report_id)
    except Exception as exc:
        logger.exception("Repository error in get_priority(%s): %s", report_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "repository_error", "message": "Failed to retrieve assessment."},
        ) from exc

    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "not_found",
                "message": f"No assessment found for report_id '{report_id}'.",
            },
        )

    return _record_to_full_assessment(record)


# ---------------------------------------------------------------------------
# POST /api/v1/priorities/score
# ---------------------------------------------------------------------------


@router.post(
    "/score",
    response_model=PriorityAssessment,
    status_code=status.HTTP_200_OK,
    summary="Score a damage report on-demand and optionally persist the result",
    description=(
        "Accepts raw report features, computes a priority assessment (deterministic "
        "or AI-assisted), and returns the result.  Pass persist=true to store the "
        "assessment in the database.  AI assessment requires ANTHROPIC_API_KEY to be "
        "configured; otherwise falls back to deterministic scoring automatically."
    ),
    responses={
        422: {"model": APIError, "description": "Invalid input data"},
        500: {"model": APIError, "description": "Scoring error"},
    },
)
def score_report(
    scoring_input: ScoringInput,
    repo: RepositoryDep,
    use_ai: Annotated[
        bool,
        Query(description="Request AI-assisted scoring (falls back to deterministic if unavailable)."),
    ] = False,
    persist: Annotated[
        bool,
        Query(description="Persist the assessment result to the database."),
    ] = False,
) -> PriorityAssessment:
    """Score a damage report and optionally persist the result."""
    try:
        if use_ai:
            assessment = ai_assessment_service.assess(scoring_input)
        else:
            assessment = scoring_service.score(scoring_input)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "invalid_input", "message": str(exc)},
        ) from exc
    except Exception as exc:
        logger.exception("Scoring error for report %s: %s", scoring_input.report_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "scoring_error", "message": "Unexpected error during scoring."},
        ) from exc

    if persist:
        try:
            repo.save(_assessment_to_record(assessment))
        except Exception as exc:
            logger.warning(
                "Failed to persist assessment for report %s: %s",
                scoring_input.report_id,
                exc,
            )
            # Persistence failure is non-fatal — return the assessment anyway

    return assessment
