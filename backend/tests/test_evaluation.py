"""
backend/tests/test_evaluation.py
----------------------------------
Unit and API tests for the evaluation service and GET /api/v1/evaluation/summary.

Coverage
--------
  ✓ All four strategy names present in output
  ✓ FIFO strategy ordered by report_date_iso (oldest first)
  ✓ Seeded Random deterministic with fixed seed
  ✓ Seeded Random with different seed produces different order
  ✓ Worst-first ordered by category rank then score
  ✓ RoadSense AI ordered by estimated benefit
  ✓ All strategies respect budget and crew-hour limits
  ✓ Outcome metrics always return status="unavailable" (no ground truth)
  ✓ Empty candidate pool → valid summary with n_candidates=0
  ✓ API GET /api/v1/evaluation/summary → 200 with correct schema
  ✓ API with use_synthetic=true → labelled synthetic data
  ✓ API with invalid budget → 422
  ✓ API with invalid crew_hour_limit → 422
  ✓ data_label propagated correctly in response
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.services.evaluation import (
    RANDOM_SEED,
    STRATEGY_FIFO,
    STRATEGY_RANDOM,
    STRATEGY_ROADSENSE,
    STRATEGY_WORST_FIRST,
    EvaluationService,
    _order_fifo,
    _order_random,
    _order_roadsense,
    _order_worst_first,
    evaluation_service,
)
from backend.services.planner import RepairCandidate


# ---------------------------------------------------------------------------
# Fixtures
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


SAMPLE_CANDIDATES = [
    make_candidate("R001", score=85.0, category="critical", cost=3_000.0, hours=8.0,
                   urgent=True, report_date="2024-03-01"),
    make_candidate("R002", score=70.0, category="high", cost=2_000.0, hours=5.0,
                   report_date="2024-01-15"),
    make_candidate("R003", score=50.0, category="medium", cost=1_000.0, hours=3.0,
                   report_date="2024-02-10"),
    make_candidate("R004", score=30.0, category="low", cost=500.0, hours=1.5,
                   report_date="2024-01-01"),
    make_candidate("R005", score=92.0, category="critical", cost=4_000.0, hours=10.0,
                   urgent=True, report_date="2024-04-01"),
]


# ---------------------------------------------------------------------------
# 1. Ordering functions
# ---------------------------------------------------------------------------


class TestOrderingFunctions:
    def test_fifo_oldest_first(self):
        ordered = _order_fifo(SAMPLE_CANDIDATES)
        dates = [c.report_date_iso for c in ordered]
        assert dates == sorted(dates)

    def test_fifo_none_date_sorted_last(self):
        candidates = [
            make_candidate("A", report_date=None),
            make_candidate("B", report_date="2024-01-01"),
        ]
        ordered = _order_fifo(candidates)
        assert ordered[0].candidate_id == "B"
        assert ordered[1].candidate_id == "A"

    def test_random_fixed_seed_deterministic(self):
        ordered1 = _order_random(SAMPLE_CANDIDATES, seed=RANDOM_SEED)
        ordered2 = _order_random(SAMPLE_CANDIDATES, seed=RANDOM_SEED)
        assert [c.candidate_id for c in ordered1] == [c.candidate_id for c in ordered2]

    def test_random_different_seed_different_order(self):
        ordered1 = _order_random(SAMPLE_CANDIDATES, seed=42)
        ordered2 = _order_random(SAMPLE_CANDIDATES, seed=99)
        # May occasionally collide for tiny lists, but with 5 elements it's very unlikely
        ids1 = [c.candidate_id for c in ordered1]
        ids2 = [c.candidate_id for c in ordered2]
        assert ids1 != ids2, "Different seeds should produce different order"

    def test_worst_first_critical_before_low(self):
        ordered = _order_worst_first(SAMPLE_CANDIDATES)
        categories = [c.priority_category for c in ordered]
        # All critical entries must come before all low entries
        critical_indices = [i for i, cat in enumerate(categories) if cat == "critical"]
        low_indices = [i for i, cat in enumerate(categories) if cat == "low"]
        if critical_indices and low_indices:
            assert max(critical_indices) < min(low_indices)

    def test_worst_first_high_score_within_same_category_first(self):
        candidates = [
            make_candidate("A", score=60.0, category="critical"),
            make_candidate("B", score=90.0, category="critical"),
        ]
        ordered = _order_worst_first(candidates)
        assert ordered[0].candidate_id == "B"

    def test_roadsense_highest_benefit_first(self):
        candidates = [
            make_candidate("LOW_BENEFIT", score=30.0, category="low"),   # 30 * 0.25 = 7.5
            make_candidate("HIGH_BENEFIT", score=90.0, category="critical"),  # 90 * 1.0 = 90
        ]
        ordered = _order_roadsense(candidates)
        assert ordered[0].candidate_id == "HIGH_BENEFIT"


# ---------------------------------------------------------------------------
# 2. Evaluation service — strategy metrics
# ---------------------------------------------------------------------------


class TestEvaluationService:
    svc = EvaluationService()

    def test_all_four_strategies_present(self):
        summary = self.svc.evaluate(
            SAMPLE_CANDIDATES, budget_limit=20_000.0, crew_hour_limit=100.0
        )
        assert STRATEGY_FIFO in summary.strategies
        assert STRATEGY_RANDOM in summary.strategies
        assert STRATEGY_WORST_FIRST in summary.strategies
        assert STRATEGY_ROADSENSE in summary.strategies

    def test_all_strategies_respect_budget(self):
        budget = 5_000.0
        summary = self.svc.evaluate(
            SAMPLE_CANDIDATES, budget_limit=budget, crew_hour_limit=999_999.0
        )
        for name, metrics in summary.strategies.items():
            assert metrics.total_estimated_cost <= budget + 1e-6, (
                f"Strategy {name} exceeded budget: {metrics.total_estimated_cost} > {budget}"
            )

    def test_all_strategies_respect_crew_hours(self):
        limit = 10.0
        summary = self.svc.evaluate(
            SAMPLE_CANDIDATES, budget_limit=999_999.0, crew_hour_limit=limit
        )
        for name, metrics in summary.strategies.items():
            assert metrics.total_estimated_crew_hours <= limit + 1e-6, (
                f"Strategy {name} exceeded crew-hours: {metrics.total_estimated_crew_hours} > {limit}"
            )

    def test_outcome_metrics_always_unavailable(self):
        """No ground truth → outcome metrics must always be 'unavailable'."""
        summary = self.svc.evaluate(
            SAMPLE_CANDIDATES, budget_limit=50_000.0, crew_hour_limit=200.0
        )
        for name, metrics in summary.strategies.items():
            assert metrics.outcome_metrics_status == "unavailable", (
                f"Strategy {name} should report outcome_metrics_status='unavailable'"
            )
            assert isinstance(metrics.outcome_metrics_note, str)
            assert metrics.outcome_metrics_note  # non-empty

    def test_empty_candidates_returns_valid_summary(self):
        summary = self.svc.evaluate([], budget_limit=10_000.0, crew_hour_limit=50.0)
        assert summary.n_candidates == 0
        for name, metrics in summary.strategies.items():
            assert metrics.n_selected == 0
            assert metrics.avg_priority_score_selected is None

    def test_data_label_propagated(self):
        summary = self.svc.evaluate(
            SAMPLE_CANDIDATES, budget_limit=50_000.0, crew_hour_limit=200.0,
            data_label="test_label"
        )
        assert summary.data_label == "test_label"

    def test_random_seed_recorded(self):
        summary = self.svc.evaluate(
            SAMPLE_CANDIDATES, budget_limit=50_000.0, crew_hour_limit=200.0,
            random_seed=77
        )
        assert summary.random_seed == 77

    def test_n_candidates_correct(self):
        summary = self.svc.evaluate(
            SAMPLE_CANDIDATES, budget_limit=50_000.0, crew_hour_limit=200.0
        )
        assert summary.n_candidates == len(SAMPLE_CANDIDATES)

    def test_invalid_budget_raises_value_error(self):
        with pytest.raises(ValueError, match="budget_limit"):
            self.svc.evaluate(SAMPLE_CANDIDATES, budget_limit=0.0, crew_hour_limit=100.0)

    def test_invalid_crew_hours_raises_value_error(self):
        with pytest.raises(ValueError, match="crew_hour_limit"):
            self.svc.evaluate(SAMPLE_CANDIDATES, budget_limit=1_000.0, crew_hour_limit=-1.0)

    def test_roadsense_selects_more_critical_than_fifo_on_test_data(self):
        """
        On SAMPLE_CANDIDATES, RoadSense AI (ordered by benefit) should select
        at least as many critical jobs as FIFO (ordered by date, oldest first).
        This test verifies the benefit ordering advantage on this specific fixture.
        """
        # FIFO order: R004(2024-01-01), R002(2024-01-15), R003(2024-02-10),
        #             R001(2024-03-01), R005(2024-04-01)
        # RoadSense order by benefit: R005(92*1.0=92), R001(85*1.0=85), R002(70*0.75=52.5), ...
        summary = self.svc.evaluate(
            SAMPLE_CANDIDATES,
            budget_limit=5_000.0,
            crew_hour_limit=15.0,
        )
        roadsense_critical = summary.strategies[STRATEGY_ROADSENSE].n_critical_selected
        fifo_critical = summary.strategies[STRATEGY_FIFO].n_critical_selected
        # RoadSense should pick at least as many critical as FIFO
        assert roadsense_critical >= fifo_critical

    def test_seeded_random_is_reproducible_across_service_instances(self):
        """Two independent service instances with same seed give same results."""
        svc1 = EvaluationService()
        svc2 = EvaluationService()
        s1 = svc1.evaluate(SAMPLE_CANDIDATES, budget_limit=50_000.0, crew_hour_limit=200.0)
        s2 = svc2.evaluate(SAMPLE_CANDIDATES, budget_limit=50_000.0, crew_hour_limit=200.0)
        assert (
            s1.strategies[STRATEGY_RANDOM].n_selected
            == s2.strategies[STRATEGY_RANDOM].n_selected
        )


# ---------------------------------------------------------------------------
# 3. API tests — GET /api/v1/evaluation/summary
# ---------------------------------------------------------------------------


def _get_test_client():
    """Return a FastAPI TestClient with evaluation router registered."""
    from fastapi import FastAPI
    from backend.api.routes.evaluation import router as eval_router

    app = FastAPI()
    app.include_router(eval_router)
    return TestClient(app)


class TestEvaluationAPI:
    @pytest.fixture(autouse=True)
    def client(self):
        self.client = _get_test_client()

    def test_get_summary_returns_200(self):
        resp = self.client.get(
            "/api/v1/evaluation/summary",
            params={"use_synthetic": True, "budget_limit": 50_000, "crew_hour_limit": 200},
        )
        assert resp.status_code == 200

    def test_response_contains_all_four_strategies(self):
        resp = self.client.get(
            "/api/v1/evaluation/summary",
            params={"use_synthetic": True, "budget_limit": 50_000, "crew_hour_limit": 200},
        )
        body = resp.json()
        assert set(body["strategies"].keys()) >= {
            STRATEGY_FIFO, STRATEGY_RANDOM, STRATEGY_WORST_FIRST, STRATEGY_ROADSENSE
        }

    def test_synthetic_label_in_data_label(self):
        resp = self.client.get(
            "/api/v1/evaluation/summary",
            params={"use_synthetic": True, "budget_limit": 50_000, "crew_hour_limit": 200},
        )
        body = resp.json()
        assert "synthetic" in body["data_label"].lower() or "SYNTHETIC" in body["data_label"]

    def test_outcome_metrics_status_unavailable_in_response(self):
        resp = self.client.get(
            "/api/v1/evaluation/summary",
            params={"use_synthetic": True, "budget_limit": 50_000, "crew_hour_limit": 200},
        )
        body = resp.json()
        for strategy_name, metrics in body["strategies"].items():
            assert metrics["outcome_metrics_status"] == "unavailable", (
                f"Strategy {strategy_name} should have outcome_metrics_status='unavailable'"
            )

    def test_schema_fields_present(self):
        resp = self.client.get(
            "/api/v1/evaluation/summary",
            params={"use_synthetic": True, "budget_limit": 50_000, "crew_hour_limit": 200},
        )
        body = resp.json()
        assert "budget_limit" in body
        assert "crew_hour_limit" in body
        assert "n_candidates" in body
        assert "random_seed" in body
        assert "disclaimer" in body
        assert "data_label" in body

    def test_strategy_metric_fields(self):
        resp = self.client.get(
            "/api/v1/evaluation/summary",
            params={"use_synthetic": True, "budget_limit": 50_000, "crew_hour_limit": 200},
        )
        body = resp.json()
        for strategy_name, m in body["strategies"].items():
            assert "n_selected" in m, f"{strategy_name} missing n_selected"
            assert "n_deferred" in m, f"{strategy_name} missing n_deferred"
            assert "total_estimated_cost" in m
            assert "total_estimated_crew_hours" in m
            assert "n_critical_selected" in m
            assert "n_urgent_unselected" in m
            assert "outcome_metrics_status" in m
            assert "outcome_metrics_note" in m

    def test_invalid_budget_returns_422(self):
        resp = self.client.get(
            "/api/v1/evaluation/summary",
            params={"budget_limit": 0, "crew_hour_limit": 200, "use_synthetic": True},
        )
        assert resp.status_code == 422

    def test_invalid_crew_hours_returns_422(self):
        resp = self.client.get(
            "/api/v1/evaluation/summary",
            params={"budget_limit": 50_000, "crew_hour_limit": 0, "use_synthetic": True},
        )
        assert resp.status_code == 422

    def test_budget_and_crew_hours_echoed_in_response(self):
        resp = self.client.get(
            "/api/v1/evaluation/summary",
            params={"use_synthetic": True, "budget_limit": 12345.0, "crew_hour_limit": 67.5},
        )
        body = resp.json()
        assert body["budget_limit"] == 12345.0
        assert body["crew_hour_limit"] == 67.5


# ---------------------------------------------------------------------------
# 4. API tests — GET /api/v1/map-points
# ---------------------------------------------------------------------------


def _get_map_client():
    from fastapi import FastAPI
    from backend.api.routes.map_points import router as map_router

    app = FastAPI()
    app.include_router(map_router)
    return TestClient(app)


class TestMapPointsAPI:
    @pytest.fixture(autouse=True)
    def client(self):
        self.client = _get_map_client()

    def test_get_map_points_returns_200(self):
        resp = self.client.get("/api/v1/map-points")
        assert resp.status_code == 200

    def test_response_schema(self):
        resp = self.client.get("/api/v1/map-points")
        body = resp.json()
        assert "data" in body
        assert "total" in body
        assert isinstance(body["data"], list)
        assert isinstance(body["total"], int)

    def test_empty_repo_returns_empty_list(self):
        """With no records in the in-memory repo, response data is empty."""
        resp = self.client.get("/api/v1/map-points")
        body = resp.json()
        assert body["total"] == 0
        assert body["data"] == []


# ---------------------------------------------------------------------------
# 5. API tests — POST /api/v1/plans
# ---------------------------------------------------------------------------


def _get_plan_client():
    from fastapi import FastAPI
    from backend.api.routes.plans import router as plan_router, get_assessment_repository
    from backend.core.repository_interface import InMemoryAssessmentRepository

    app = FastAPI()
    app.dependency_overrides[get_assessment_repository] = lambda: InMemoryAssessmentRepository()
    app.include_router(plan_router)
    return TestClient(app)


class TestPlansAPI:
    @pytest.fixture(autouse=True)
    def client(self):
        self.client = _get_plan_client()

    def test_post_plan_returns_200(self):
        resp = self.client.post(
            "/api/v1/plans",
            json={"budget_limit": 50_000.0, "crew_hour_limit": 200.0},
        )
        assert resp.status_code == 200

    def test_response_schema_fields(self):
        resp = self.client.post(
            "/api/v1/plans",
            json={"budget_limit": 50_000.0, "crew_hour_limit": 200.0},
        )
        body = resp.json()
        assert "selected_jobs" in body
        assert "deferred_jobs" in body
        assert "urgent_unselected" in body
        assert "total_estimated_cost" in body
        assert "total_estimated_crew_hours" in body
        assert "budget_limit" in body
        assert "crew_hour_limit" in body
        assert "planner_mode" in body
        assert "planner_version" in body
        assert "disclaimer" in body

    def test_missing_budget_returns_422(self):
        resp = self.client.post(
            "/api/v1/plans",
            json={"crew_hour_limit": 200.0},
        )
        assert resp.status_code == 422

    def test_zero_budget_returns_422(self):
        resp = self.client.post(
            "/api/v1/plans",
            json={"budget_limit": 0.0, "crew_hour_limit": 200.0},
        )
        assert resp.status_code == 422

    def test_zero_crew_hours_returns_422(self):
        resp = self.client.post(
            "/api/v1/plans",
            json={"budget_limit": 50_000.0, "crew_hour_limit": 0.0},
        )
        assert resp.status_code == 422

    def test_budget_echoed_in_response(self):
        resp = self.client.post(
            "/api/v1/plans",
            json={"budget_limit": 12_345.0, "crew_hour_limit": 100.0},
        )
        body = resp.json()
        assert body["budget_limit"] == 12_345.0

    def test_empty_repo_returns_empty_selection(self):
        resp = self.client.post(
            "/api/v1/plans",
            json={"budget_limit": 50_000.0, "crew_hour_limit": 200.0},
        )
        body = resp.json()
        assert body["selected_jobs"] == []

    def test_max_jobs_optional_field(self):
        resp = self.client.post(
            "/api/v1/plans",
            json={"budget_limit": 50_000.0, "crew_hour_limit": 200.0, "max_jobs": 5},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("max_jobs") == 5

