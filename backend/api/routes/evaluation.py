"""
backend/api/routes/evaluation.py
----------------------------------
GET /api/v1/evaluation/summary — compare four planning strategies.

Design decisions
----------------
* All four strategies run against the same candidates fetched from the
  assessment repository in a single request.
* When the repository is empty (no candidates), the endpoint returns a valid
  summary with n_candidates=0 and all strategy metrics zeroed — it does NOT
  return an error or fabricate data.
* Outcome metrics that require ground-truth repair data are explicitly marked
  outcome_metrics_status="unavailable".
* A query parameter `use_synthetic` allows callers to force synthetic demo
  data (useful for plumbing tests); this is always labelled "[SYNTHETIC]".
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from backend.core.repository_interface import (
    AssessmentRepository,
    InMemoryAssessmentRepository,
)
from backend.schemas.plan import (
    APIError,
    EvaluationSummaryResponse,
    StrategyMetricsResponse,
)
from backend.services.evaluation import (
    RANDOM_SEED,
    EvaluationSummary,
    StrategyMetrics,
    evaluation_service,
)
from backend.services.planner import RepairCandidate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/evaluation", tags=["evaluation"])

# ---------------------------------------------------------------------------
# Repository dependency
# ---------------------------------------------------------------------------

_fallback_repo: InMemoryAssessmentRepository = InMemoryAssessmentRepository()

_FETCH_PAGE_SIZE = 500


def get_repository() -> AssessmentRepository:
    """FastAPI dependency for the assessment repository."""
    try:
        from backend.repositories.assessment import assessment_repository  # type: ignore[import]
        return assessment_repository  # type: ignore[return-value]
    except ImportError:
        return _fallback_repo


RepositoryDep = Annotated[AssessmentRepository, Depends(get_repository)]

# ---------------------------------------------------------------------------
# Synthetic demo data  *** LABELLED SYNTHETIC — do not treat as real ***
# ---------------------------------------------------------------------------

_SYNTHETIC_CANDIDATES: list[RepairCandidate] = [
    RepairCandidate(
        candidate_id="SYNTH-001",
        priority_score=92.0,
        priority_category="critical",
        is_urgent=True,
        report_date_iso="2024-01-05",
    ),
    RepairCandidate(
        candidate_id="SYNTH-002",
        priority_score=74.0,
        priority_category="high",
        is_urgent=False,
        report_date_iso="2024-01-10",
    ),
    RepairCandidate(
        candidate_id="SYNTH-003",
        priority_score=55.0,
        priority_category="medium",
        is_urgent=False,
        report_date_iso="2024-01-03",
    ),
    RepairCandidate(
        candidate_id="SYNTH-004",
        priority_score=85.0,
        priority_category="critical",
        is_urgent=True,
        report_date_iso="2024-01-01",
    ),
    RepairCandidate(
        candidate_id="SYNTH-005",
        priority_score=30.0,
        priority_category="low",
        is_urgent=False,
        report_date_iso="2024-01-15",
    ),
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _record_to_candidate(record) -> RepairCandidate:
    return RepairCandidate(
        candidate_id=record.report_id,
        priority_score=record.priority_score,
        priority_category=record.priority_category,
        estimated_cost=None,
        estimated_crew_hours=None,
        is_urgent=(record.priority_category.lower() == "critical"),
        report_date_iso=None,
        metadata={},
    )


def _metrics_to_response(m: StrategyMetrics) -> StrategyMetricsResponse:
    return StrategyMetricsResponse(
        strategy=m.strategy,
        n_selected=m.n_selected,
        n_deferred=m.n_deferred,
        total_estimated_cost=m.total_estimated_cost,
        total_estimated_crew_hours=m.total_estimated_crew_hours,
        avg_priority_score_selected=m.avg_priority_score_selected,
        n_critical_selected=m.n_critical_selected,
        n_urgent_unselected=m.n_urgent_unselected,
        outcome_metrics_status=m.outcome_metrics_status,
        outcome_metrics_note=m.outcome_metrics_note,
    )


def _summary_to_response(s: EvaluationSummary) -> EvaluationSummaryResponse:
    return EvaluationSummaryResponse(
        strategies={k: _metrics_to_response(v) for k, v in s.strategies.items()},
        budget_limit=s.budget_limit,
        crew_hour_limit=s.crew_hour_limit,
        n_candidates=s.n_candidates,
        random_seed=s.random_seed,
        data_label=s.data_label,
        disclaimer=s.disclaimer,
    )


# ---------------------------------------------------------------------------
# GET /api/v1/evaluation/summary
# ---------------------------------------------------------------------------


@router.get(
    "/summary",
    response_model=EvaluationSummaryResponse,
    summary="Compare four maintenance-planning strategies",
    description=(
        "Runs FIFO, Seeded Random, Worst-first, and RoadSense AI strategies "
        "against the same candidate pool with equal budget and crew-hour limits. "
        "Outcome metrics that require ground-truth data are returned with "
        "outcome_metrics_status='unavailable'.  "
        "Set use_synthetic=true to run against labelled synthetic demo data."
    ),
    responses={
        422: {"model": APIError, "description": "Invalid query parameters"},
        500: {"model": APIError, "description": "Internal server error"},
    },
)
def evaluation_summary(
    repo: RepositoryDep,
    budget_limit: Annotated[
        float,
        Query(gt=0, description="Budget constraint applied to all strategies."),
    ] = 50_000.0,
    crew_hour_limit: Annotated[
        float,
        Query(gt=0, description="Crew-hour constraint applied to all strategies."),
    ] = 200.0,
    use_synthetic: Annotated[
        bool,
        Query(
            description=(
                "If true, use labelled synthetic demo data instead of the "
                "live repository.  Results will be labelled '[SYNTHETIC]'."
            )
        ),
    ] = False,
) -> EvaluationSummaryResponse:
    """Compare four planning strategies against identical constraints."""

    if use_synthetic:
        candidates = _SYNTHETIC_CANDIDATES
        data_label = "[SYNTHETIC] demo fixtures — not real road data"
        logger.info("Evaluation: using synthetic demo candidates.")
    else:
        # Fetch from live repository
        try:
            page_result = repo.list_assessments(page=1, page_size=_FETCH_PAGE_SIZE)
        except Exception as exc:
            logger.exception("Repository error in evaluation_summary: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={
                    "error": "repository_error",
                    "message": "Failed to retrieve candidates for evaluation.",
                },
            ) from exc

        candidates = [_record_to_candidate(r) for r in page_result.items]
        data_label = "real"
        logger.info("Evaluation: %d candidates fetched from repository.", len(candidates))

    try:
        summary = evaluation_service.evaluate(
            candidates=candidates,
            budget_limit=budget_limit,
            crew_hour_limit=crew_hour_limit,
            data_label=data_label,
            random_seed=RANDOM_SEED,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "invalid_evaluation_request", "message": str(exc)},
        ) from exc
    except Exception as exc:
        logger.exception("Evaluation error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "evaluation_error",
                "message": "Unexpected error during strategy evaluation.",
            },
        ) from exc

    return _summary_to_response(summary)

