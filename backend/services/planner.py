"""
backend/services/planner.py
---------------------------
Resource-constrained maintenance planner for RoadSense AI.

Algorithm
---------
This module implements a **greedy priority-first heuristic**.  The planner
sorts candidates by their estimated risk-reduction benefit in descending order,
then iterates through the sorted list, accepting each job only if both the
budget and crew-hour constraints are satisfied after acceptance.  When a job
does not fit, the planner records the reason and continues considering
subsequent candidates.

IMPORTANT — limitations of the greedy heuristic
------------------------------------------------
A greedy algorithm does NOT guarantee a globally optimal plan.  It may miss
combinations of smaller jobs that together yield a higher total benefit than
the single large job it selects first.  For operational use, consider this a
defensible, reproducible baseline, not an exact optimisation.  If exact
optimisation is required, integrate an OR-Tools model (out of scope for v1).

Estimated risk reduction (benefit)
------------------------------------
Benefit is estimated as:

    benefit = priority_score * severity_weight

where severity_weight encodes how much the repair is expected to reduce risk:
    critical  → 1.0   (full weight; highest expected risk reduction)
    high      → 0.75
    medium    → 0.50
    low       → 0.25

This is a heuristic proxy for risk reduction, not an actuarially validated
safety metric.  It is explicitly labelled as an estimate throughout the API.

Cost and duration estimates
----------------------------
Repair costs and durations are NOT invented here.  They must be supplied by
the caller in the RepairCandidate object or default to the configured
ESTIMATE tables defined in this module.  If neither caller-supplied values nor
config tables cover a case, the value is labelled as an estimate and flagged.

The following DEMO_ESTIMATES are labelled synthetic and are provided only as
development/testing fixtures.  Do NOT use them for real procurement.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Final, Sequence

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Planner metadata
# ---------------------------------------------------------------------------

PLANNER_VERSION: Final[str] = "1.0.0"
PLANNER_MODE: Final[str] = "greedy_priority_first"

# ---------------------------------------------------------------------------
# Severity weight table (used to estimate risk-reduction benefit)
# ---------------------------------------------------------------------------

SEVERITY_WEIGHTS: Final[dict[str, float]] = {
    "critical": 1.00,
    "high": 0.75,
    "medium": 0.50,
    "low": 0.25,
}

# ---------------------------------------------------------------------------
# Demo cost/duration estimates  *** SYNTHETIC — do not use for procurement ***
# ---------------------------------------------------------------------------
# These are placeholder values for development and unit-testing only.
# Replace with real cost models before operational deployment.

DEMO_COST_ESTIMATES: Final[dict[str, float]] = {
    "critical": 8_000.0,   # £ — synthetic
    "high": 4_000.0,       # £ — synthetic
    "medium": 2_000.0,     # £ — synthetic
    "low": 800.0,          # £ — synthetic
}

DEMO_DURATION_ESTIMATES: Final[dict[str, float]] = {
    "critical": 16.0,   # crew-hours — synthetic
    "high": 8.0,        # crew-hours — synthetic
    "medium": 4.0,      # crew-hours — synthetic
    "low": 2.0,         # crew-hours — synthetic
}

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class RepairCandidate:
    """
    A single road-damage job that the planner may select.

    Parameters
    ----------
    candidate_id:
        Stable identifier (e.g. report_id or damage_id).
    priority_score:
        0–100 score from the scoring engine.
    priority_category:
        One of: "critical", "high", "medium", "low".
    estimated_cost:
        Estimated repair cost in the configured currency.  If None, the
        planner looks up DEMO_COST_ESTIMATES (labelled synthetic).
    estimated_crew_hours:
        Estimated crew time in hours.  If None, the planner looks up
        DEMO_DURATION_ESTIMATES (labelled synthetic).
    is_urgent:
        Caller-supplied flag to mark safety-critical or legally urgent jobs.
        Urgent jobs that remain unselected are highlighted in the output.
    report_date_iso:
        ISO 8601 date string (YYYY-MM-DD) of the original report, used by
        the FIFO baseline strategy in evaluation.
    metadata:
        Arbitrary key/value pairs passed through to the output unchanged.
    """

    candidate_id: str
    priority_score: float
    priority_category: str          # "critical" | "high" | "medium" | "low"
    estimated_cost: float | None = None
    estimated_crew_hours: float | None = None
    is_urgent: bool = False
    report_date_iso: str | None = None
    metadata: dict = field(default_factory=dict)


@dataclass
class SelectedJob:
    """A candidate accepted into the maintenance plan."""

    candidate_id: str
    priority_score: float
    priority_category: str
    estimated_cost: float
    estimated_crew_hours: float
    estimated_benefit: float
    cost_is_estimate: bool
    duration_is_estimate: bool
    is_urgent: bool
    metadata: dict = field(default_factory=dict)


@dataclass
class DeferredJob:
    """A candidate not selected and the reason why."""

    candidate_id: str
    priority_score: float
    priority_category: str
    is_urgent: bool
    deferral_reason: str
    metadata: dict = field(default_factory=dict)


@dataclass
class PlanResult:
    """
    Full output of a single planner run.

    Attributes
    ----------
    selected_jobs:
        Jobs accepted into the plan (all constraints satisfied).
    deferred_jobs:
        Jobs not selected, each with an explicit deferral reason.
    urgent_unselected:
        Subset of deferred_jobs where is_urgent=True.  Highlighted here
        for immediate review; the planner cannot guarantee their selection.
    total_estimated_cost:
        Sum of estimated costs for selected jobs only.
    total_estimated_crew_hours:
        Sum of estimated crew-hours for selected jobs only.
    budget_limit:
        The budget constraint that was applied.
    crew_hour_limit:
        The crew-hour constraint that was applied.
    max_jobs:
        Optional cap on number of jobs (None = unlimited).
    planner_mode:
        Algorithm identifier (always "greedy_priority_first" in v1).
    planner_version:
        Semantic version of the planner module.
    disclaimer:
        Human-readable caveat about heuristic limitations.
    """

    selected_jobs: list[SelectedJob]
    deferred_jobs: list[DeferredJob]
    urgent_unselected: list[DeferredJob]
    total_estimated_cost: float
    total_estimated_crew_hours: float
    budget_limit: float
    crew_hour_limit: float
    max_jobs: int | None
    planner_mode: str
    planner_version: str
    disclaimer: str = (
        "This plan was produced by a greedy heuristic and does NOT guarantee "
        "a globally optimal selection.  All cost and duration values are estimates. "
        "Urgent unselected jobs require manual review."
    )


# ---------------------------------------------------------------------------
# Deferral reasons (machine-readable string constants)
# ---------------------------------------------------------------------------

REASON_EXCEEDS_BUDGET: Final[str] = "exceeds_remaining_budget"
REASON_EXCEEDS_CREW_HOURS: Final[str] = "exceeds_remaining_crew_hours"
REASON_EXCEEDS_BOTH: Final[str] = "exceeds_remaining_budget_and_crew_hours"
REASON_JOB_LIMIT: Final[str] = "job_limit_reached"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _resolve_cost(candidate: RepairCandidate) -> tuple[float, bool]:
    """
    Return (estimated_cost, is_demo_estimate).

    If the candidate supplies an explicit cost, use it (is_demo_estimate=False).
    Otherwise, look up DEMO_COST_ESTIMATES.
    """
    if candidate.estimated_cost is not None:
        return candidate.estimated_cost, False
    cat = candidate.priority_category.lower()
    demo_cost = DEMO_COST_ESTIMATES.get(cat, DEMO_COST_ESTIMATES["medium"])
    return demo_cost, True


def _resolve_duration(candidate: RepairCandidate) -> tuple[float, bool]:
    """
    Return (estimated_crew_hours, is_demo_estimate).

    If the candidate supplies explicit crew hours, use it.
    Otherwise, look up DEMO_DURATION_ESTIMATES.
    """
    if candidate.estimated_crew_hours is not None:
        return candidate.estimated_crew_hours, False
    cat = candidate.priority_category.lower()
    demo_dur = DEMO_DURATION_ESTIMATES.get(cat, DEMO_DURATION_ESTIMATES["medium"])
    return demo_dur, True


def _compute_benefit(candidate: RepairCandidate) -> float:
    """
    Estimate risk-reduction benefit for a candidate.

    benefit = priority_score × severity_weight

    This is a heuristic proxy, not an actuarially validated measure.
    """
    weight = SEVERITY_WEIGHTS.get(
        candidate.priority_category.lower(),
        0.50,   # default to medium weight if category is unrecognised
    )
    return candidate.priority_score * weight


# ---------------------------------------------------------------------------
# Planner
# ---------------------------------------------------------------------------


class MaintenancePlanner:
    """
    Resource-constrained maintenance planner (greedy heuristic, v1).

    Usage::

        planner = MaintenancePlanner()
        result = planner.plan(
            candidates=repair_candidates,
            budget_limit=50_000.0,
            crew_hour_limit=200.0,
            max_jobs=20,
        )

    The planner is stateless; a single instance can be reused safely.
    """

    def plan(
        self,
        candidates: Sequence[RepairCandidate],
        *,
        budget_limit: float,
        crew_hour_limit: float,
        max_jobs: int | None = None,
    ) -> PlanResult:
        """
        Select maintenance jobs within budget and crew-hour constraints.

        Algorithm
        ---------
        1. Compute estimated risk-reduction benefit for every candidate.
        2. Sort candidates by benefit descending (highest benefit first).
        3. Iterate through sorted candidates:
           a. If the job-count limit is already reached, defer with REASON_JOB_LIMIT.
           b. Check whether accepting this job would exceed budget, crew-hours,
              or both.  Defer with the appropriate reason and CONTINUE to the
              next candidate (do not stop the loop).
           c. Accept the job; deduct its cost and duration from the remaining
              budget and crew-hours.
        4. Collect urgent jobs that remain deferred for explicit highlighting.

        Parameters
        ----------
        candidates:
            Eligible repair jobs.  May be empty.
        budget_limit:
            Maximum total spend (inclusive).  Must be > 0.
        crew_hour_limit:
            Maximum total crew-hours (inclusive).  Must be > 0.
        max_jobs:
            Optional cap on number of selected jobs.  None = unlimited.

        Returns
        -------
        PlanResult

        Raises
        ------
        ValueError
            If budget_limit <= 0 or crew_hour_limit <= 0.
        """
        if budget_limit <= 0:
            raise ValueError(
                f"budget_limit must be positive; got {budget_limit!r}."
            )
        if crew_hour_limit <= 0:
            raise ValueError(
                f"crew_hour_limit must be positive; got {crew_hour_limit!r}."
            )

        # Sort by estimated benefit descending
        sorted_candidates = sorted(
            candidates,
            key=_compute_benefit,
            reverse=True,
        )

        selected: list[SelectedJob] = []
        deferred: list[DeferredJob] = []
        remaining_budget = budget_limit
        remaining_hours = crew_hour_limit

        for candidate in sorted_candidates:
            cost, cost_is_demo = _resolve_cost(candidate)
            duration, dur_is_demo = _resolve_duration(candidate)
            benefit = _compute_benefit(candidate)

            # Check job-count limit first
            if max_jobs is not None and len(selected) >= max_jobs:
                deferred.append(DeferredJob(
                    candidate_id=candidate.candidate_id,
                    priority_score=candidate.priority_score,
                    priority_category=candidate.priority_category,
                    is_urgent=candidate.is_urgent,
                    deferral_reason=REASON_JOB_LIMIT,
                    metadata=candidate.metadata,
                ))
                continue

            # Check constraints — independent checks to give specific reasons
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
                # CONTINUE — do not stop; a later smaller job may still fit
                continue

            # Accept the job
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

        # Identify urgent jobs that were not selected
        urgent_unselected = [d for d in deferred if d.is_urgent]

        if urgent_unselected:
            logger.warning(
                "PlanResult: %d urgent job(s) could not be selected — "
                "manual review required: %s",
                len(urgent_unselected),
                [d.candidate_id for d in urgent_unselected],
            )

        total_cost = sum(j.estimated_cost for j in selected)
        total_hours = sum(j.estimated_crew_hours for j in selected)

        logger.info(
            "Planner: selected=%d deferred=%d urgent_unselected=%d "
            "total_cost=%.2f total_hours=%.2f",
            len(selected),
            len(deferred),
            len(urgent_unselected),
            total_cost,
            total_hours,
        )

        return PlanResult(
            selected_jobs=selected,
            deferred_jobs=deferred,
            urgent_unselected=urgent_unselected,
            total_estimated_cost=total_cost,
            total_estimated_crew_hours=total_hours,
            budget_limit=budget_limit,
            crew_hour_limit=crew_hour_limit,
            max_jobs=max_jobs,
            planner_mode=PLANNER_MODE,
            planner_version=PLANNER_VERSION,
        )


# Module-level singleton
maintenance_planner = MaintenancePlanner()

