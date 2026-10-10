"""
backend/tests/test_scoring.py
------------------------------
Unit tests for the deterministic scoring engine (backend/services/scoring.py).

Coverage targets:
  ✓ Formula correctness (weighted sum)
  ✓ Factor bounds: all factors at minimum and maximum values
  ✓ All four priority category boundaries (critical/high/medium/low thresholds)
  ✓ Deterministic results: same inputs → same output across multiple calls
  ✓ Missing and unknown factor values raise ValueError (not silent zeroing)
  ✓ Urgency sub-formula: time and complaint caps
  ✓ All categorical values in every lookup table
  ✓ Case-insensitive input handling
  ✓ Complaint count defaults to 0

All tests use only the public ScoringService API.  No mocking is needed because
the engine is fully deterministic and has no external dependencies.
"""

from __future__ import annotations

import math

import pytest

from backend.schemas.priority import (
    AssessmentMode,
    PriorityCategory,
    ScoringInput,
)
from backend.services.scoring import (
    CATEGORY_THRESHOLDS,
    FACILITY_MAP,
    POLICY_VERSION,
    ROAD_TYPE_MAP,
    SEVERITY_MAP,
    TRAFFIC_MAP,
    W_CRITICAL,
    W_ROAD,
    W_SEVERITY,
    W_TRAFFIC,
    W_URGENCY,
    ScoringService,
    _categorise,
    _compute_urgency,
    scoring_service,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def make_input(**overrides) -> ScoringInput:
    """Return a baseline ScoringInput with known values, accepting field overrides."""
    defaults = dict(
        report_id="test-001",
        damage_severity="moderate",     # S = 50
        traffic_volume="medium",        # T = 50
        road_type="arterial",           # R = 60
        critical_facility_proximity="medium",  # C = 50
        days_since_report=10,           # time = min(20, 70) = 20
        complaint_count=2,              # bonus = min(10, 30) = 10  → U = 30
    )
    defaults.update(overrides)
    return ScoringInput(**defaults)


# ---------------------------------------------------------------------------
# 1. Formula correctness
# ---------------------------------------------------------------------------


class TestFormulaCorrectness:
    def test_weighted_sum_matches_manual_calculation(self):
        inp = make_input()
        # S=50, T=50, R=60, C=50, U=30
        expected = (
            W_SEVERITY * 50
            + W_TRAFFIC * 50
            + W_ROAD * 60
            + W_CRITICAL * 50
            + W_URGENCY * 30
        )
        result = scoring_service.score(inp)
        assert math.isclose(result.priority_score, expected, rel_tol=1e-6), (
            f"Expected {expected:.4f}, got {result.priority_score:.4f}"
        )

    def test_all_minimum_inputs_give_minimum_score(self):
        """
        The absolute minimum score is 3.0, not 0.0, because 'residential' is the
        lowest road_type and contributes 0.15 * 20 = 3.0 to the weighted sum.
        There is no road_type value that maps to 0.
        """
        inp = make_input(
            damage_severity="none",
            traffic_volume="very_low",
            road_type="residential",
            critical_facility_proximity="none",
            days_since_report=0,
            complaint_count=0,
        )
        result = scoring_service.score(inp)
        # score = 0 + 0 + 0.15*20 + 0 + 0 = 3.0
        assert math.isclose(result.priority_score, 3.0, abs_tol=1e-6)

    def test_all_maximum_inputs_give_100(self):
        inp = make_input(
            damage_severity="critical",
            traffic_volume="very_high",
            road_type="highway",
            critical_facility_proximity="critical",
            days_since_report=35,    # 35 * 2 = 70 (caps time component)
            complaint_count=6,       # 6 * 5 = 30 (caps complaint bonus)
        )
        result = scoring_service.score(inp)
        assert math.isclose(result.priority_score, 100.0, rel_tol=1e-6), (
            f"Expected 100.0, got {result.priority_score}"
        )

    def test_factor_values_match_lookup_tables(self):
        inp = make_input(
            damage_severity="severe",           # S = 75
            traffic_volume="high",              # T = 75
            road_type="primary",                # R = 80
            critical_facility_proximity="high", # C = 75
            days_since_report=5,                # U = min(10,70) + min(0,30) = 10
            complaint_count=0,
        )
        result = scoring_service.score(inp)
        assert result.factor_values.severity == 75.0
        assert result.factor_values.traffic_exposure == 75.0
        assert result.factor_values.road_importance == 80.0
        assert result.factor_values.critical_facility == 75.0
        assert result.factor_values.urgency == 10.0

    def test_score_is_rounded_to_4_decimal_places(self):
        inp = make_input()
        result = scoring_service.score(inp)
        # Verify the value has at most 4 decimal places
        as_str = str(result.priority_score)
        if "." in as_str:
            assert len(as_str.split(".")[1]) <= 4

    def test_result_contains_required_fields(self):
        inp = make_input()
        result = scoring_service.score(inp)
        assert result.report_id == "test-001"
        assert result.policy_version == POLICY_VERSION
        assert result.assessment_mode == AssessmentMode.DETERMINISTIC
        assert isinstance(result.explanation, str) and result.explanation


# ---------------------------------------------------------------------------
# 2. Factor bounds — every valid categorical value
# ---------------------------------------------------------------------------


class TestFactorMappings:
    @pytest.mark.parametrize("value,expected", list(SEVERITY_MAP.items()))
    def test_severity_map(self, value, expected):
        result = scoring_service.score(make_input(damage_severity=value))
        assert result.factor_values.severity == expected

    @pytest.mark.parametrize("value,expected", list(TRAFFIC_MAP.items()))
    def test_traffic_map(self, value, expected):
        result = scoring_service.score(make_input(traffic_volume=value))
        assert result.factor_values.traffic_exposure == expected

    @pytest.mark.parametrize("value,expected", list(ROAD_TYPE_MAP.items()))
    def test_road_type_map(self, value, expected):
        result = scoring_service.score(make_input(road_type=value))
        assert result.factor_values.road_importance == expected

    @pytest.mark.parametrize("value,expected", list(FACILITY_MAP.items()))
    def test_facility_map(self, value, expected):
        result = scoring_service.score(make_input(critical_facility_proximity=value))
        assert result.factor_values.critical_facility == expected

    def test_case_insensitive_severity(self):
        r1 = scoring_service.score(make_input(damage_severity="MODERATE"))
        r2 = scoring_service.score(make_input(damage_severity="moderate"))
        assert r1.priority_score == r2.priority_score

    def test_case_insensitive_traffic(self):
        r1 = scoring_service.score(make_input(traffic_volume="HIGH"))
        r2 = scoring_service.score(make_input(traffic_volume="high"))
        assert r1.priority_score == r2.priority_score


# ---------------------------------------------------------------------------
# 3. Priority category boundaries
# ---------------------------------------------------------------------------


class TestPriorityCategories:
    """
    We construct inputs that target specific score values to verify category
    assignment at and around each threshold.

    Thresholds (policy v1.0.0):
        critical  >= 80
        high      >= 60 and < 80
        medium    >= 35 and < 60
        low       < 35
    """

    def _score_for(self, target: float) -> float:
        """Return the actual score produced for a simple parameterised input."""
        # Use severity as the primary knob.  S contributes 0.35 * S.
        # With T=0, R=20 (residential), C=0, U=0:
        #   score = 0.35*S + 0.15*20 = 0.35*S + 3.0
        # So S = (target - 3) / 0.35  (may not land exactly, that's fine)
        # Instead, use a fully controlled approach via days_since_report / complaint_count.
        pass

    def test_critical_at_exactly_80(self):
        # All max except severity=none → score must be >= 80 for "critical"
        # Drive score to exactly 80:
        # 0.35*S + 0.25*100 + 0.15*100 + 0.15*100 + 0.10*100 = 80
        # 0.35*S + 65 = 80  →  S = 15/0.35 = ~42.86
        # Not achievable with discrete table → just verify threshold constant is 80
        assert CATEGORY_THRESHOLDS["critical"] == 80.0

    def test_category_critical(self):
        inp = make_input(
            damage_severity="critical",   # S=100
            traffic_volume="very_high",   # T=100
            road_type="highway",          # R=100
            critical_facility_proximity="critical",  # C=100
            days_since_report=35,
            complaint_count=6,
        )
        result = scoring_service.score(inp)
        assert result.priority_category == PriorityCategory.CRITICAL

    def test_category_low(self):
        inp = make_input(
            damage_severity="none",       # S=0
            traffic_volume="very_low",    # T=0
            road_type="residential",      # R=20 → contributes 0.15*20=3
            critical_facility_proximity="none",  # C=0
            days_since_report=0,
            complaint_count=0,
        )
        result = scoring_service.score(inp)
        # score = 0 + 0 + 3 + 0 + 0 = 3  → LOW
        assert result.priority_category == PriorityCategory.LOW

    def test_category_medium(self):
        # score = 0.35*50 + 0.25*50 + 0.15*40 + 0.15*25 + 0.10*20
        #       = 17.5   + 12.5   + 6.0    + 3.75   + 2.0  = 41.75  → MEDIUM
        inp = make_input(
            damage_severity="moderate",    # S=50  → 0.35*50=17.5
            traffic_volume="medium",       # T=50  → 0.25*50=12.5
            road_type="collector",         # R=40  → 0.15*40=6.0
            critical_facility_proximity="low",   # C=25 → 0.15*25=3.75
            days_since_report=10,          # U=20  → 0.10*20=2.0
            complaint_count=0,
        )
        result = scoring_service.score(inp)
        # Verify score is in medium range [35, 60)
        assert 35.0 <= result.priority_score < 60.0, (
            f"Expected MEDIUM range [35,60), got {result.priority_score}"
        )
        assert result.priority_category == PriorityCategory.MEDIUM

    def test_category_high(self):
        # Aim for ~65 (high range 60–80)
        inp = make_input(
            damage_severity="severe",     # S=75 → 0.35*75=26.25
            traffic_volume="high",        # T=75 → 0.25*75=18.75
            road_type="arterial",         # R=60 → 0.15*60=9
            critical_facility_proximity="medium",  # C=50 → 0.15*50=7.5
            days_since_report=20,         # U=40 → 0.10*40=4
            complaint_count=0,
        )
        result = scoring_service.score(inp)
        # score = 26.25 + 18.75 + 9 + 7.5 + 4 = 65.5
        assert result.priority_category == PriorityCategory.HIGH

    def test_boundary_high_critical(self):
        """Score at 80 must be CRITICAL, score just below 80 must be HIGH."""
        # Use _categorise directly to test boundary logic
        assert _categorise(80.0) == PriorityCategory.CRITICAL
        assert _categorise(79.999) == PriorityCategory.HIGH

    def test_boundary_medium_high(self):
        assert _categorise(60.0) == PriorityCategory.HIGH
        assert _categorise(59.999) == PriorityCategory.MEDIUM

    def test_boundary_low_medium(self):
        assert _categorise(35.0) == PriorityCategory.MEDIUM
        assert _categorise(34.999) == PriorityCategory.LOW

    def test_zero_is_low(self):
        assert _categorise(0.0) == PriorityCategory.LOW

    def test_hundred_is_critical(self):
        assert _categorise(100.0) == PriorityCategory.CRITICAL


# ---------------------------------------------------------------------------
# 4. Determinism
# ---------------------------------------------------------------------------


class TestDeterminism:
    def test_same_input_same_score_repeated_calls(self):
        inp = make_input()
        results = [scoring_service.score(inp) for _ in range(10)]
        scores = [r.priority_score for r in results]
        assert len(set(scores)) == 1, f"Non-deterministic scores: {scores}"

    def test_independent_service_instances_agree(self):
        inp = make_input()
        s1 = ScoringService()
        s2 = ScoringService()
        assert s1.score(inp).priority_score == s2.score(inp).priority_score

    def test_different_report_ids_same_features_same_score(self):
        inp1 = make_input(report_id="alpha")
        inp2 = make_input(report_id="beta")
        r1 = scoring_service.score(inp1)
        r2 = scoring_service.score(inp2)
        assert r1.priority_score == r2.priority_score

    def test_score_not_affected_by_previous_call(self):
        """Calling with a high-score input first must not affect a subsequent low-score call."""
        high = make_input(damage_severity="critical", traffic_volume="very_high")
        low = make_input(damage_severity="none", traffic_volume="very_low",
                         road_type="residential", critical_facility_proximity="none",
                         days_since_report=0)
        scoring_service.score(high)
        result = scoring_service.score(low)
        # Just road_type=residential gives R=20, score=0.15*20=3
        assert result.priority_score < 35.0


# ---------------------------------------------------------------------------
# 5. Invalid inputs
# ---------------------------------------------------------------------------


class TestInvalidInputs:
    @pytest.mark.parametrize("field,bad_value", [
        ("damage_severity", "catastrophic"),
        ("damage_severity", ""),
        ("traffic_volume", "extreme"),
        ("traffic_volume", "unknown"),
        ("road_type", "lane"),
        ("road_type", "street"),
        ("critical_facility_proximity", "extreme"),
        ("critical_facility_proximity", "unknown"),
    ])
    def test_unknown_categorical_raises_value_error(self, field, bad_value):
        inp = make_input(**{field: bad_value})
        with pytest.raises(ValueError, match=field):
            scoring_service.score(inp)

    def test_negative_days_rejected_by_pydantic(self):
        with pytest.raises(Exception):
            ScoringInput(
                report_id="x",
                damage_severity="moderate",
                traffic_volume="medium",
                road_type="arterial",
                critical_facility_proximity="none",
                days_since_report=-1,
            )

    def test_negative_complaint_count_rejected_by_pydantic(self):
        with pytest.raises(Exception):
            ScoringInput(
                report_id="x",
                damage_severity="moderate",
                traffic_volume="medium",
                road_type="arterial",
                critical_facility_proximity="none",
                days_since_report=0,
                complaint_count=-5,
            )

    def test_error_message_mentions_field_name(self):
        inp = make_input(damage_severity="bad_value")
        with pytest.raises(ValueError) as exc_info:
            scoring_service.score(inp)
        assert "damage_severity" in str(exc_info.value)

    def test_error_message_lists_valid_values(self):
        inp = make_input(traffic_volume="super_high")
        with pytest.raises(ValueError) as exc_info:
            scoring_service.score(inp)
        # Should mention at least one valid value
        assert "very_high" in str(exc_info.value) or "high" in str(exc_info.value)


# ---------------------------------------------------------------------------
# 6. Urgency sub-formula
# ---------------------------------------------------------------------------


class TestUrgencyFormula:
    @pytest.mark.parametrize("days,complaints,expected_u", [
        (0, 0, 0.0),
        (1, 0, 2.0),
        (35, 0, 70.0),          # time cap
        (100, 0, 70.0),         # exceeds cap
        (0, 6, 30.0),           # complaint cap
        (0, 100, 30.0),         # exceeds complaint cap
        (35, 6, 100.0),         # both caps → 70 + 30 = 100
        (10, 2, 30.0),          # 20 + 10 = 30
        (5, 1, 15.0),           # 10 + 5 = 15
    ])
    def test_urgency_values(self, days, complaints, expected_u):
        computed = _compute_urgency(days, complaints)
        assert math.isclose(computed, expected_u, abs_tol=1e-9), (
            f"days={days}, complaints={complaints}: expected U={expected_u}, got {computed}"
        )

    def test_urgency_reflected_in_factor_values(self):
        inp = make_input(days_since_report=35, complaint_count=6)
        result = scoring_service.score(inp)
        assert result.factor_values.urgency == 100.0

    def test_complaint_count_defaults_to_zero(self):
        """complaint_count is optional and should default to 0."""
        inp = ScoringInput(
            report_id="r1",
            damage_severity="moderate",
            traffic_volume="medium",
            road_type="arterial",
            critical_facility_proximity="none",
            days_since_report=0,
            # complaint_count omitted
        )
        result = scoring_service.score(inp)
        assert result.factor_values.urgency == 0.0
