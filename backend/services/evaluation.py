"""
backend/services/evaluation.py
-------------------------------
Baseline strategy comparison for RoadSense AI maintenance planning.

Purpose
-------
This module compares four planning strategies against identical candidate
pools, budgets, and crew-hour limits:

1. **FIFO** — First-In, First-Out.  Jobs are ordered by original report date
   (oldest first).  Represents the status-quo queue-based approach.

2. **Seeded Random** — A deterministic random shuffle with a fixed seed.
   Serves as a statistical null baseline.  The seed is documented here and
   fixed at module level so results are reproducible.

3. **Worst-first** — Jobs ordered by severity (priority_category) then
   priority_score, both descending.  Represents the intuitive "fix the worst
   damage first" heuristic.

4. **RoadSense AI** — The greedy priority-first planner from planner.py,
   ordered by estimated risk-reduction benefit.

All four strategies use the same candidate set, the same budget limit, and the
same crew-hour limit.  The selection engine is the same greedy loop from
MaintenancePlanner to ensure only the ordering differs.

Metric availability policy
---------------------------
Metrics that require ground-truth repair outcomes (e.g. before/after incident
rates, measured safety improvement) are NOT available in this prototype because
no validated outcome dataset exists.  These metrics are returned with
status="unavailable" and a clear explanation.

Synthetic fixtures used in unit tests are explicitly labelled "[SYNTHETIC]".
"""

from __future__ import annotations

import logging
import random
from dataclasses import dataclass, field
from typing import Final, Sequence

from backend.services.planner import (
    DeferredJob,
    MaintenancePlanner,
    PlanResult,
    RepairCandidate,
    SEVERITY_WEIGHTS,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RANDOM_SEED: Final[int] = 42
"""Fixed seed for the Seeded Random baseline.  Change only with full re-evaluation."""

STRATEGY_FIFO: Final[str] = "fifo"
STRATEGY_RANDOM: Final[str] = "seeded_random"
STRATEGY_WORST_FIRST: Final[str] = "worst_first"
STRATEGY_ROADSENSE: Final[str] = "roadsense_ai"

_CATEGORY_RANK: Final[dict[str, int]] = {
    "critical": 4,
    "high": 3,
    "medium": 2,
    "low": 1,
}

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class StrategyMetrics:
    """
    Computed metrics for a single strategy.

    Fields
    ------
    strategy:
        Strategy identifier.
    n_selected:
        Number of jobs selected.
    n_deferred:
        Number of jobs deferred.
    total_estimated_cost:
        Summed estimated cost of selected jobs.
    total_estimated_crew_hours:
        Summed estimated crew-hours of selected jobs.
    avg_priority_score_selected:
        Mean priority score of selected jobs (None if none selected).
    n_critical_selected:
        Number of "critical" priority jobs selected.
    n_urgent_unselected:
        Number of urgent jobs that could not be selected.
    outcome_metrics_status:
        "unavailable" in v1 — no validated ground-truth outcome dataset exists.
    outcome_metrics_note:
        Explanation of why outcome metrics are unavailable.
    """

    strategy: str
    n_selected: int
    n_deferred: int
    total_estimated_cost: float
    total_estimated_crew_hours: float
    avg_priority_score_selected: float | None
    n_critical_selected: int
    n_urgent_unselected: int
    outcome_metrics_status: str = "unavailable"
    outcome_metrics_note: str = (
        "Ground-truth repair-outcome data (e.g. post-repair incident rates) "
        "is not available for this prototype. Outcome metrics will be populated "
        "when a validated outcome dataset is provided."
    )


@dataclass
class EvaluationSummary:
    """
    Comparison of all four strategies against identical inputs.

    Attributes
    ----------
    strategies:
        Results for each strategy (keys are strategy identifiers).
    budget_limit:
        Budget constraint applied to all strategies.
    crew_hour_limit:
        Crew-hour constraint applied to all strategies.
    n_candidates:
        Total number of candidates supplied.
    random_seed:
        Seed used for the Seeded Random baseline.
    data_label:
        "real" or "synthetic" — labelled by the caller.
    disclaimer:
        Caveat about prototype limitations.
    """

    strategies: dict[str, StrategyMetrics]
    budget_limit: float
    crew_hour_limit: float
    n_candidates: int
    random_seed: int
    data_label: str
    disclaimer: str = (
        "All strategies use the same greedy selection engine; differences "
        "arise solely from candidate ordering.  Cost and duration values are "
        "estimates.  Outcome metrics require ground-truth data not yet available."
    )


# ---------------------------------------------------------------------------
# Ordering functions (pure, testable)
# ---------------------------------------------------------------------------


def _order_fifo(candidates: list[RepairCandidate]) -> list[RepairCandidate]:
    """
    Sort candidates by report_date_iso ascending (oldest first).

    Candidates with no report_date_iso are sorted to the end (treated as if
    just reported) to avoid silently discarding them.
    """
    return sorted(
        candidates,
        key=lambda c: (c.report_date_iso or "9999-12-31"),
    )


def _order_random(
    candidates: list[RepairCandidate],
    seed: int = RANDOM_SEED,
) -> list[RepairCandidate]:
    """
    Randomly shuffle candidates using a fixed seed (deterministic).

    The seed is fixed so results are reproducible across runs.
    """
    rng = random.Random(seed)
    shuffled = list(candidates)
    rng.shuffle(shuffled)
    return shuffled


def _order_worst_first(candidates: list[RepairCandidate]) -> list[RepairCandidate]:
    """
    Sort candidates by category rank then priority_score, both descending.

    "Worst" is determined by the priority_category (critical > high > medium > low)
    and, within the same category, by priority_score.
    """
    return sorted(
        candidates,
        key=lambda c: (
            _CATEGORY_RANK.get(c.priority_category.lower(), 0),
            c.priority_score,
        ),
        reverse=True,
    )


def _order_roadsense(candidates: list[RepairCandidate]) -> list[RepairCandidate]:
    """
    Sort candidates by estimated risk-reduction benefit descending.

    This is the same ordering used by MaintenancePlanner.plan(), replicated
    here so the evaluation module is self-contained.
    """
    def benefit(c: RepairCandidate) -> float:
        weight = SEVERITY_WEIGHTS.get(c.priority_category.lower(), 0.50)
        return c.priority_score * weight

    return sorted(candidates, key=benefit, reverse=True)


# ---------------------------------------------------------------------------
# Metric computation
# ---------------------------------------------------------------------------


def _compute_metrics(
    strategy: str,
    plan: PlanResult,
) -> StrategyMetrics:
    """Derive StrategyMetrics from a completed PlanResult."""
    scores = [j.priority_score for j in plan.selected_jobs]
    avg_score = sum(scores) / len(scores) if scores else None
    n_critical = sum(
        1 for j in plan.selected_jobs
        if j.priority_category.lower() == "critical"
    )
    return StrategyMetrics(
        strategy=strategy,
        n_selected=len(plan.selected_jobs),
        n_deferred=len(plan.deferred_jobs),
        total_estimated_cost=plan.total_estimated_cost,
        total_estimated_crew_hours=plan.total_estimated_crew_hours,
        avg_priority_score_selected=avg_score,
        n_critical_selected=n_critical,
        n_urgent_unselected=len(plan.urgent_unselected),
    )


# ---------------------------------------------------------------------------
# Evaluation service
# ---------------------------------------------------------------------------


class EvaluationService:
    """
    Compares four planning strategies on equal footing.

    Usage::

        service = EvaluationService()
        summary = service.evaluate(
            candidates=repair_candidates,
            budget_limit=50_000.0,
            crew_hour_limit=200.0,
            data_label="real",
        )
    """

    def __init__(self) -> None:
        self._planner = MaintenancePlanner()

    def _run_strategy(
        self,
        candidates: list[RepairCandidate],
        ordered: list[RepairCandidate],
        budget_limit: float,
        crew_hour_limit: float,
    ) -> PlanResult:
        """
        Run the greedy planner on a pre-ordered candidate list.

        The planner sorts by benefit internally, so we need to override the
        sort.  We do this by setting each candidate's priority_score and
        category to produce the same ordering that was passed in.  Instead of
        monkey-patching, we run the planner's loop directly with preserved order.

        Since MaintenancePlanner.plan() re-sorts internally, we create a
        thin wrapper that runs the same greedy loop but without re-sorting.
        """
        from backend.services.planner import (
            _resolve_cost,
            _resolve_duration,
            _compute_benefit,
            SelectedJob,
            DeferredJob,
            REASON_EXCEEDS_BUDGET,
            REASON_EXCEEDS_CREW_HOURS,
            REASON_EXCEEDS_BOTH,
            PLANNER_MODE,
            PLANNER_VERSION,
        )

        selected: list[SelectedJob] = []
        deferred: list[DeferredJob] = []
        remaining_budget = budget_limit
        remaining_hours = crew_hour_limit

        for candidate in ordered:
            cost, cost_is_demo = _resolve_cost(candidate)
            duration, dur_is_demo = _resolve_duration(candidate)
            benefit = _compute_benefit(candidate)

            over_budget = cost > remaining_budget
            over_hours = duration > remaining_hours

            if over_budget and over_hours:
                reason = REASON_EXCEEDS_BOTH
            elif over_budget:
                reason = REASON_EXCEEDS_BUDGET
            elif over_hours:
                reason = REASON_EXCEEDS_CREW_HOURS
            else:
                reason = None

            if reason is not None:
                deferred.append(DeferredJob(
                    candidate_id=candidate.candidate_id,
                    priority_score=candidate.priority_score,
                    priority_category=candidate.priority_category,
                    is_urgent=candidate.is_urgent,
                    deferral_reason=reason,
                    metadata=candidate.metadata,
                ))
                continue

            selected.append(SelectedJob(
                candidate_id=candidate.candidate_id,
                priority_score=candidate.priority_score,
                priority_category=candidate.priority_category,
                estimated_cost=cost,
                estimated_crew_hours=duration,
                estimated_benefit=benefit,
                cost_is_estimate=cost_is_demo,
                duration_is_estimate=dur_is_demo,
                is_urgent=candidate.is_urgent,
                metadata=candidate.metadata,
            ))
            remaining_budget -= cost
            remaining_hours -= duration

        urgent_unselected = [d for d in deferred if d.is_urgent]
        total_cost = sum(j.estimated_cost for j in selected)
        total_hours = sum(j.estimated_crew_hours for j in selected)

        return PlanResult(
            selected_jobs=selected,
            deferred_jobs=deferred,
            urgent_unselected=urgent_unselected,
            total_estimated_cost=total_cost,
            total_estimated_crew_hours=total_hours,
            budget_limit=budget_limit,
            crew_hour_limit=crew_hour_limit,
            max_jobs=None,
            planner_mode=PLANNER_MODE,
            planner_version=PLANNER_VERSION,
        )

    def evaluate(
        self,
        candidates: Sequence[RepairCandidate],
        *,
        budget_limit: float,
        crew_hour_limit: float,
        data_label: str = "real",
        random_seed: int = RANDOM_SEED,
    ) -> EvaluationSummary:
        """
        Run all four strategies and return a comparative summary.

        Parameters
        ----------
        candidates:
            The same pool of repair candidates given to every strategy.
        budget_limit:
            Budget constraint (identical across all strategies).
        crew_hour_limit:
            Crew-hour constraint (identical across all strategies).
        data_label:
            "real" or "synthetic".  Caller is responsible for accurate labelling.
        random_seed:
            Seed for the Seeded Random baseline (default 42).

        Returns
        -------
        EvaluationSummary

        Raises
        ------
        ValueError
            If budget_limit <= 0 or crew_hour_limit <= 0.
        """
        if budget_limit <= 0:
            raise ValueError(f"budget_limit must be positive; got {budget_limit!r}.")
        if crew_hour_limit <= 0:
            raise ValueError(f"crew_hour_limit must be positive; got {crew_hour_limit!r}.")

        candidate_list = list(candidates)

        orderings: dict[str, list[RepairCandidate]] = {
            STRATEGY_FIFO: _order_fifo(candidate_list),
            STRATEGY_RANDOM: _order_random(candidate_list, seed=random_seed),
            STRATEGY_WORST_FIRST: _order_worst_first(candidate_list),
            STRATEGY_ROADSENSE: _order_roadsense(candidate_list),
        }

        results: dict[str, StrategyMetrics] = {}
        for strategy_name, ordered in orderings.items():
            plan = self._run_strategy(
                candidate_list,
                ordered,
                budget_limit=budget_limit,
                crew_hour_limit=crew_hour_limit,
            )
            results[strategy_name] = _compute_metrics(strategy_name, plan)
            logger.debug(
                "Strategy '%s': selected=%d deferred=%d cost=%.2f hours=%.2f",
                strategy_name,
                results[strategy_name].n_selected,
                results[strategy_name].n_deferred,
                results[strategy_name].total_estimated_cost,
                results[strategy_name].total_estimated_crew_hours,
            )

        return EvaluationSummary(
            strategies=results,
            budget_limit=budget_limit,
            crew_hour_limit=crew_hour_limit,
            n_candidates=len(candidate_list),
            random_seed=random_seed,
            data_label=data_label,
        )


# Module-level singleton
evaluation_service = EvaluationService()

