"""
backend/tests/test_planner.py
------------------------------
Unit tests for backend/services/planner.py.

Coverage
--------
  ✓ Empty candidate list → empty selection, no deferral
  ✓ Budget constraint independently enforced (never exceeded)
  ✓ Crew-hour constraint independently enforced (never exceeded)
  ✓ Both constraints together
  ✓ A candidate that exceeds budget is skipped while later candidates are still selected
  ✓ Deferral reasons are machine-readable and accurate
  ✓ Urgent jobs that remain unselected are highlighted in urgent_unselected
  ✓ max_jobs cap applies and produces correct deferral reason
  ✓ Planner mode and version metadata present
  ✓ Disclaimer present
  ✓ Greedy ordering by benefit (highest benefit selected first)
  ✓ Caller-supplied cost/duration used (no demo estimate applied)
  ✓ Demo estimate applied when no caller values supplied
  ✓ cost_is_estimate / duration_is_estimate flags accurate
  ✓ Invalid budget raises ValueError
  ✓ Invalid crew_hour_limit raises ValueError
"""

from __future__ import annotations

import pytest

from backend.services.planner import (
    PLANNER_MODE,
    PLANNER_VERSION,
    REASON_EXCEEDS_BOTH,
    REASON_EXCEEDS_BUDGET,
    REASON_EXCEEDS_CREW_HOURS,
    REASON_JOB_LIMIT,
    MaintenancePlanner,
    RepairCandidate,
    maintenance_planner,
    _compute_benefit,
)


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def make_candidate(
    cid: str,
    score: float = 50.0,
    category: str = "medium",
    cost: float | None = None,
    hours: float | None = None,
    urgent: bool = False,
    report_date: str | None = None,
) -> RepairCandidate:
    return RepairCandidate(
        candidate_id=cid,
        priority_score=score,
        priority_category=category,
        estimated_cost=cost,
        estimated_crew_hours=hours,
        is_urgent=urgent,
        report_date_iso=report_date,
    )


PLANNER = MaintenancePlanner()

# ---------------------------------------------------------------------------
# 1. Empty candidate list
# ---------------------------------------------------------------------------


class TestEmptyCandidates:
    def test_empty_list_returns_empty_plan(self):
        result = PLANNER.plan([], budget_limit=10_000.0, crew_hour_limit=100.0)
        assert result.selected_jobs == []
        assert result.deferred_jobs == []
        assert result.urgent_unselected == []
        assert result.total_estimated_cost == 0.0
        assert result.total_estimated_crew_hours == 0.0

    def test_empty_list_has_correct_metadata(self):
        result = PLANNER.plan([], budget_limit=5_000.0, crew_hour_limit=50.0)
        assert result.planner_mode == PLANNER_MODE
        assert result.planner_version == PLANNER_VERSION
        assert isinstance(result.disclaimer, str) and result.disclaimer


# ---------------------------------------------------------------------------
# 2. Budget constraint
# ---------------------------------------------------------------------------


class TestBudgetConstraint:
    def test_selected_cost_never_exceeds_budget(self):
        """Total selected cost must be <= budget_limit."""
        budget = 5_000.0
        candidates = [
            make_candidate("A", score=90.0, category="critical", cost=2_000.0, hours=5.0),
            make_candidate("B", score=80.0, category="high", cost=2_000.0, hours=5.0),
            make_candidate("C", score=70.0, category="high", cost=2_000.0, hours=5.0),
        ]
        result = PLANNER.plan(candidates, budget_limit=budget, crew_hour_limit=999_999.0)
        assert result.total_estimated_cost <= budget

    def test_job_exceeding_budget_is_deferred_with_correct_reason(self):
        """A job that would push total over budget must have reason REASON_EXCEEDS_BUDGET."""
        candidates = [
            make_candidate("A", score=90.0, category="critical", cost=3_000.0, hours=5.0),
            make_candidate("B", score=80.0, category="high", cost=3_000.0, hours=5.0),
        ]
        # Budget only covers one job
        result = PLANNER.plan(candidates, budget_limit=4_000.0, crew_hour_limit=999_999.0)
        deferred_ids = {d.candidate_id for d in result.deferred_jobs}
        assert "B" in deferred_ids
        deferred_b = next(d for d in result.deferred_jobs if d.candidate_id == "B")
        assert deferred_b.deferral_reason == REASON_EXCEEDS_BUDGET

    def test_zero_budget_raises_value_error(self):
        with pytest.raises(ValueError, match="budget_limit"):
            PLANNER.plan([], budget_limit=0.0, crew_hour_limit=100.0)

    def test_negative_budget_raises_value_error(self):
        with pytest.raises(ValueError, match="budget_limit"):
            PLANNER.plan([], budget_limit=-1.0, crew_hour_limit=100.0)


# ---------------------------------------------------------------------------
# 3. Crew-hour constraint
# ---------------------------------------------------------------------------


class TestCrewHourConstraint:
    def test_selected_hours_never_exceed_limit(self):
        limit = 10.0
        candidates = [
            make_candidate("A", score=90.0, category="critical", cost=500.0, hours=6.0),
            make_candidate("B", score=80.0, category="high", cost=500.0, hours=6.0),
        ]
        result = PLANNER.plan(candidates, budget_limit=999_999.0, crew_hour_limit=limit)
        assert result.total_estimated_crew_hours <= limit

    def test_job_exceeding_hours_deferred_with_correct_reason(self):
        candidates = [
            make_candidate("A", score=90.0, category="critical", cost=500.0, hours=8.0),
            make_candidate("B", score=80.0, category="high", cost=500.0, hours=8.0),
        ]
        result = PLANNER.plan(candidates, budget_limit=999_999.0, crew_hour_limit=10.0)
        assert any(d.deferral_reason == REASON_EXCEEDS_CREW_HOURS for d in result.deferred_jobs)

    def test_zero_crew_hours_raises_value_error(self):
        with pytest.raises(ValueError, match="crew_hour_limit"):
            PLANNER.plan([], budget_limit=1_000.0, crew_hour_limit=0.0)

    def test_negative_crew_hours_raises_value_error(self):
        with pytest.raises(ValueError, match="crew_hour_limit"):
            PLANNER.plan([], budget_limit=1_000.0, crew_hour_limit=-5.0)


# ---------------------------------------------------------------------------
# 4. Both constraints together
# ---------------------------------------------------------------------------


class TestBothConstraints:
    def test_job_exceeding_both_deferred_with_combined_reason(self):
        candidates = [
            make_candidate("A", score=90.0, category="critical", cost=6_000.0, hours=20.0),
        ]
        result = PLANNER.plan(candidates, budget_limit=5_000.0, crew_hour_limit=10.0)
        assert len(result.selected_jobs) == 0
        assert result.deferred_jobs[0].deferral_reason == REASON_EXCEEDS_BOTH

    def test_total_within_both_limits(self):
        candidates = [
            make_candidate("A", score=90.0, category="critical", cost=3_000.0, hours=8.0),
            make_candidate("B", score=80.0, category="high", cost=2_000.0, hours=5.0),
        ]
        result = PLANNER.plan(candidates, budget_limit=6_000.0, crew_hour_limit=15.0)
        assert result.total_estimated_cost <= 6_000.0
        assert result.total_estimated_crew_hours <= 15.0
        assert len(result.selected_jobs) == 2


# ---------------------------------------------------------------------------
# 5. Skip-and-continue behaviour
# ---------------------------------------------------------------------------


class TestSkipAndContinue:
    def test_expensive_job_skipped_cheaper_job_selected(self):
        """
        Job A (high benefit, high cost) exceeds remaining budget after job B.
        The planner should skip A and continue to select C (smaller, fits).
        """
        candidates = [
            make_candidate("B", score=95.0, category="critical", cost=4_000.0, hours=5.0),
            make_candidate("A", score=85.0, category="critical", cost=5_000.0, hours=5.0),  # won't fit after B
            make_candidate("C", score=50.0, category="medium", cost=500.0, hours=2.0),     # should fit
        ]
        result = PLANNER.plan(
            candidates,
            budget_limit=5_000.0,
            crew_hour_limit=999_999.0,
        )
        selected_ids = {j.candidate_id for j in result.selected_jobs}
        # B and C should be selected; A deferred because it doesn't fit after B
        assert "B" in selected_ids
        assert "C" in selected_ids
        assert "A" not in selected_ids

    def test_deferred_job_has_reason_budget(self):
        """Skipped job must have an explicit deferral reason."""
        candidates = [
            make_candidate("BIG", score=90.0, category="critical", cost=9_000.0, hours=5.0),
            make_candidate("SMALL", score=50.0, category="medium", cost=500.0, hours=2.0),
        ]
        result = PLANNER.plan(candidates, budget_limit=5_000.0, crew_hour_limit=999_999.0)
        deferred_big = next(d for d in result.deferred_jobs if d.candidate_id == "BIG")
        assert deferred_big.deferral_reason in {
            REASON_EXCEEDS_BUDGET, REASON_EXCEEDS_BOTH
        }


# ---------------------------------------------------------------------------
# 6. Urgent unselected jobs
# ---------------------------------------------------------------------------


class TestUrgentUnselected:
    def test_urgent_deferred_job_appears_in_urgent_unselected(self):
        candidates = [
            make_candidate(
                "URGENT_A", score=95.0, category="critical",
                cost=99_000.0, hours=5.0, urgent=True
            ),
        ]
        result = PLANNER.plan(candidates, budget_limit=1_000.0, crew_hour_limit=100.0)
        assert len(result.urgent_unselected) == 1
        assert result.urgent_unselected[0].candidate_id == "URGENT_A"

    def test_non_urgent_deferred_not_in_urgent_unselected(self):
        candidates = [
            make_candidate("NON_URGENT", score=50.0, category="medium",
                           cost=99_000.0, hours=5.0, urgent=False),
        ]
        result = PLANNER.plan(candidates, budget_limit=100.0, crew_hour_limit=100.0)
        assert len(result.urgent_unselected) == 0
        assert len(result.deferred_jobs) == 1

    def test_urgent_selected_job_not_in_urgent_unselected(self):
        candidates = [
            make_candidate("URGENT_B", score=90.0, category="critical",
                           cost=500.0, hours=2.0, urgent=True),
        ]
        result = PLANNER.plan(candidates, budget_limit=10_000.0, crew_hour_limit=100.0)
        selected_ids = {j.candidate_id for j in result.selected_jobs}
        assert "URGENT_B" in selected_ids
        assert len(result.urgent_unselected) == 0


# ---------------------------------------------------------------------------
# 7. Job limit (max_jobs)
# ---------------------------------------------------------------------------


class TestJobLimit:
    def test_max_jobs_limits_selected_count(self):
        candidates = [make_candidate(f"J{i}", score=float(90 - i), category="high",
                                     cost=1_000.0, hours=2.0) for i in range(5)]
        result = PLANNER.plan(candidates, budget_limit=999_999.0,
                               crew_hour_limit=999_999.0, max_jobs=2)
        assert len(result.selected_jobs) == 2

    def test_jobs_beyond_limit_deferred_with_job_limit_reason(self):
        candidates = [make_candidate(f"J{i}", score=float(90 - i), category="high",
                                     cost=1_000.0, hours=2.0) for i in range(4)]
        result = PLANNER.plan(candidates, budget_limit=999_999.0,
                               crew_hour_limit=999_999.0, max_jobs=2)
        deferred_reasons = {d.deferral_reason for d in result.deferred_jobs}
        assert REASON_JOB_LIMIT in deferred_reasons

    def test_max_jobs_none_applies_no_cap(self):
        candidates = [make_candidate(f"J{i}", score=float(90 - i), category="high",
                                     cost=1_000.0, hours=2.0) for i in range(5)]
        result = PLANNER.plan(candidates, budget_limit=999_999.0,
                               crew_hour_limit=999_999.0, max_jobs=None)
        assert len(result.selected_jobs) == 5


# ---------------------------------------------------------------------------
# 8. Benefit ordering
# ---------------------------------------------------------------------------


class TestBenefitOrdering:
    def test_highest_benefit_selected_first_within_budget(self):
        """
        With a budget that only fits one job, the one with highest benefit
        should be selected.
        """
        candidates = [
            make_candidate("LOW_BENEFIT", score=30.0, category="low",
                           cost=2_000.0, hours=3.0),
            make_candidate("HIGH_BENEFIT", score=95.0, category="critical",
                           cost=2_000.0, hours=3.0),
        ]
        result = PLANNER.plan(candidates, budget_limit=3_000.0, crew_hour_limit=999_999.0)
        selected_ids = [j.candidate_id for j in result.selected_jobs]
        assert "HIGH_BENEFIT" in selected_ids
        assert "LOW_BENEFIT" not in selected_ids

    def test_benefit_computed_from_score_and_weight(self):
        critical = make_candidate("C", score=80.0, category="critical")
        low = make_candidate("L", score=80.0, category="low")
        # critical benefit = 80 * 1.0 = 80; low benefit = 80 * 0.25 = 20
        assert _compute_benefit(critical) > _compute_benefit(low)


# ---------------------------------------------------------------------------
# 9. Cost / duration estimate flags
# ---------------------------------------------------------------------------


class TestEstimateFlags:
    def test_caller_supplied_cost_not_flagged_as_estimate(self):
        candidates = [make_candidate("A", score=70.0, category="high",
                                     cost=3_500.0, hours=7.0)]
        result = PLANNER.plan(candidates, budget_limit=50_000.0, crew_hour_limit=100.0)
        assert len(result.selected_jobs) == 1
        job = result.selected_jobs[0]
        assert not job.cost_is_estimate
        assert not job.duration_is_estimate

    def test_demo_estimate_flagged_when_no_cost_supplied(self):
        candidates = [make_candidate("A", score=70.0, category="high")]  # no cost/hours
        result = PLANNER.plan(candidates, budget_limit=50_000.0, crew_hour_limit=100.0)
        assert len(result.selected_jobs) == 1
        job = result.selected_jobs[0]
        assert job.cost_is_estimate
        assert job.duration_is_estimate


# ---------------------------------------------------------------------------
# 10. Planner metadata
# ---------------------------------------------------------------------------


class TestPlannerMetadata:
    def test_planner_mode_is_greedy(self):
        result = PLANNER.plan([], budget_limit=1_000.0, crew_hour_limit=10.0)
        assert result.planner_mode == PLANNER_MODE

    def test_planner_version_present(self):
        result = PLANNER.plan([], budget_limit=1_000.0, crew_hour_limit=10.0)
        assert result.planner_version == PLANNER_VERSION

    def test_disclaimer_mentions_heuristic(self):
        result = PLANNER.plan([], budget_limit=1_000.0, crew_hour_limit=10.0)
        assert "heuristic" in result.disclaimer.lower() or "greedy" in result.disclaimer.lower()

    def test_budget_limit_recorded_in_result(self):
        result = PLANNER.plan([], budget_limit=12_345.0, crew_hour_limit=10.0)
        assert result.budget_limit == 12_345.0

    def test_crew_hour_limit_recorded_in_result(self):
        result = PLANNER.plan([], budget_limit=1_000.0, crew_hour_limit=67.89)
        assert result.crew_hour_limit == 67.89

