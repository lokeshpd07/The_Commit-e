"""
backend/services/ai_assessment.py
----------------------------------
Optional Anthropic-powered priority assessment.

Design contract
---------------
1. AI assessment is *optional*: the application starts, routes respond, and tests
   pass even when the Anthropic SDK is not installed or ANTHROPIC_API_KEY is unset.
2. Only the minimum validated feature set is sent to the API — no PII (no reporter
   names, phone numbers, or addresses).
3. The AI response is validated against a strict schema before any field is used.
   Identifiers and enums are checked for an exact match; numeric bounds are
   enforced.  If validation fails, the deterministic score is used instead.
4. A configurable timeout prevents runaway requests.
5. All failure modes (missing credentials, import error, HTTP error, JSON parse
   error, schema validation error, timeout) fall back to the deterministic engine
   and are logged at WARNING level.
6. The assessment_mode field in the returned PriorityAssessment records which path
   was taken — clients must never infer the mode from the score value itself.
7. AI scores are never labelled as safety certifications.  The disclaimer appears
   in the explanation field whenever AI mode is used.

Privacy policy (documented)
-----------
Fields NEVER sent to Anthropic:
  - Reporter name
  - Reporter phone / e-mail
  - Exact GPS coordinates (only categorical proximity is sent)
  - Free-text descriptions containing PII

Fields sent (all already validated / categorised):
  - report_id (opaque identifier)
  - damage_severity (categorical)
  - traffic_volume (categorical)
  - road_type (categorical)
  - critical_facility_proximity (categorical)
  - days_since_report (integer)
  - complaint_count (integer)
  - deterministic_score (float) — provided as a reference anchor
"""

from __future__ import annotations

import json
import logging
from typing import Any

from backend.core.config import settings
from backend.schemas.priority import (
    AssessmentMode,
    FactorValues,
    PriorityAssessment,
    PriorityCategory,
    ScoringInput,
)
from backend.services.scoring import (
    POLICY_VERSION,
    ScoringService,
    _categorise,
    _build_explanation,
    _lookup,
    _compute_urgency,
    SEVERITY_MAP,
    TRAFFIC_MAP,
    ROAD_TYPE_MAP,
    FACILITY_MAP,
    W_SEVERITY,
    W_TRAFFIC,
    W_ROAD,
    W_CRITICAL,
    W_URGENCY,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional SDK import — guarded so the app works without the Anthropic package
# ---------------------------------------------------------------------------

try:
    import anthropic as _anthropic_sdk  # type: ignore[import-not-found]
    _SDK_AVAILABLE = True
except ImportError:
    _anthropic_sdk = None  # type: ignore[assignment]
    _SDK_AVAILABLE = False

# ---------------------------------------------------------------------------
# Expected keys in the AI JSON response
# ---------------------------------------------------------------------------

_REQUIRED_AI_KEYS = {
    "report_id",
    "priority_score",
    "priority_category",
    "severity",
    "traffic_exposure",
    "road_importance",
    "critical_facility",
    "urgency",
    "explanation",
}

_VALID_CATEGORIES = {c.value for c in PriorityCategory}

_NUMERIC_FIELDS = {
    "priority_score",
    "severity",
    "traffic_exposure",
    "road_importance",
    "critical_facility",
    "urgency",
}

# System prompt sent to Anthropic
_SYSTEM_PROMPT = """\
You are a road-damage prioritisation assistant for a municipal infrastructure system.
You will receive structured feature data about a reported road defect and a
deterministic baseline score produced by the city's scoring engine.

Your task is to return a JSON object with the following exact keys:
  report_id           (string)  – echo back the received report_id unchanged
  priority_score      (float)   – 0.0 to 100.0, your adjusted priority estimate
  priority_category   (string)  – exactly one of: critical, high, medium, low
  severity            (float)   – 0.0 to 100.0, your assessed severity factor
  traffic_exposure    (float)   – 0.0 to 100.0, your traffic-exposure factor
  road_importance     (float)   – 0.0 to 100.0, your road-importance factor
  critical_facility   (float)   – 0.0 to 100.0, your critical-facility factor
  urgency             (float)   – 0.0 to 100.0, your urgency factor
  explanation         (string)  – one concise sentence (≤ 200 chars) justifying the score

Rules:
1. Respond with ONLY the JSON object — no markdown, no extra text.
2. All numeric fields must be in [0.0, 100.0].
3. priority_category must exactly match one of: critical, high, medium, low.
4. Do NOT include PII, guesses about named locations, or safety certifications.
5. Your score is advisory; the system will validate and may override it.
"""


def _build_user_message(inp: ScoringInput, deterministic_score: float) -> str:
    """Build the user message payload (no PII)."""
    payload = {
        "report_id": inp.report_id,
        "damage_severity": inp.damage_severity,
        "traffic_volume": inp.traffic_volume,
        "road_type": inp.road_type,
        "critical_facility_proximity": inp.critical_facility_proximity,
        "days_since_report": inp.days_since_report,
        "complaint_count": inp.complaint_count,
        "deterministic_baseline_score": round(deterministic_score, 4),
    }
    return json.dumps(payload, ensure_ascii=False)


def _validate_ai_response(
    raw: dict[str, Any],
    expected_report_id: str,
) -> dict[str, Any]:
    """
    Validate the AI JSON response.

    Raises
    ------
    ValueError
        On any schema violation so the caller can fall back to deterministic scoring.
    """
    # 1. All required keys present
    missing = _REQUIRED_AI_KEYS - raw.keys()
    if missing:
        raise ValueError(f"AI response missing keys: {missing}")

    # 2. report_id must match exactly (prevents cross-contamination)
    if raw["report_id"] != expected_report_id:
        raise ValueError(
            f"AI report_id mismatch: expected '{expected_report_id}', "
            f"got '{raw['report_id']}'"
        )

    # 3. priority_category must be a known enum value
    if raw["priority_category"] not in _VALID_CATEGORIES:
        raise ValueError(
            f"AI returned unknown priority_category '{raw['priority_category']}'. "
            f"Valid: {_VALID_CATEGORIES}"
        )

    # 4. All numeric fields must be floats/ints in [0, 100]
    for field in _NUMERIC_FIELDS:
        val = raw[field]
        if not isinstance(val, (int, float)):
            raise ValueError(f"AI field '{field}' must be numeric, got {type(val).__name__}")
        if not (0.0 <= float(val) <= 100.0):
            raise ValueError(f"AI field '{field}' out of bounds: {val}")

    # 5. Explanation must be a non-empty string
    if not isinstance(raw.get("explanation"), str) or not raw["explanation"].strip():
        raise ValueError("AI explanation must be a non-empty string")

    # 6. Consistency check: category must match score
    score = float(raw["priority_score"])
    declared_cat = raw["priority_category"]
    expected_cat = _categorise(score).value
    if declared_cat != expected_cat:
        logger.warning(
            "AI category '%s' inconsistent with score %.1f (expected '%s'); "
            "overriding category with deterministic derivation.",
            declared_cat,
            score,
            expected_cat,
        )
        raw["priority_category"] = expected_cat

    return raw


class AIAssessmentService:
    """
    Optional Anthropic-powered assessment layer.

    Call `assess()` to get an AI-assisted PriorityAssessment.  If any step fails
    (SDK absent, missing credentials, network error, validation error), the method
    falls back to the deterministic engine and logs a WARNING.

    This class never modifies global state and is safe to instantiate once and
    reuse across the application lifetime.
    """

    def __init__(self) -> None:
        self._deterministic = ScoringService()

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    def assess(self, inp: ScoringInput) -> PriorityAssessment:
        """
        Return a PriorityAssessment, trying AI first and falling back deterministically.

        The assessment_mode field in the result tells the caller which path was taken.
        """
        if not self._can_use_ai():
            return self._deterministic_fallback(inp, reason="AI assessment not configured")

        # Compute deterministic baseline first (used as anchor for the AI prompt)
        baseline = self._deterministic.score(inp)

        try:
            ai_result = self._call_anthropic(inp, baseline.priority_score)
            assessment = self._build_assessment_from_ai(inp, ai_result)
            logger.info(
                "AI assessment complete for report %s: score=%.2f category=%s",
                inp.report_id,
                assessment.priority_score,
                assessment.priority_category,
            )
            return assessment

        except Exception as exc:  # noqa: BLE001 – intentionally broad catch for fallback
            logger.warning(
                "AI assessment failed for report %s (%s: %s); "
                "falling back to deterministic scoring.",
                inp.report_id,
                type(exc).__name__,
                exc,
            )
            # Return the already-computed deterministic baseline rather than
            # re-computing it (efficiency + avoids any potential non-determinism
            # from re-running with different system state).
            return baseline

    # -----------------------------------------------------------------------
    # Private helpers
    # -----------------------------------------------------------------------

    def _can_use_ai(self) -> bool:
        if not _SDK_AVAILABLE:
            logger.debug("Anthropic SDK not installed; AI assessment disabled.")
            return False
        if not settings.ai_enabled:
            logger.debug("AI assessment disabled via configuration.")
            return False
        return True

    def _call_anthropic(
        self,
        inp: ScoringInput,
        deterministic_score: float,
    ) -> dict[str, Any]:
        """
        Call the Anthropic Messages API and return the parsed JSON dict.

        Raises
        ------
        Exception
            Any error from the SDK, network, JSON parsing, or schema validation.
        """
        client = _anthropic_sdk.Anthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            timeout=settings.AI_ASSESSMENT_TIMEOUT,
        )

        user_message = _build_user_message(inp, deterministic_score)

        response = client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=512,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )

        raw_text: str = response.content[0].text  # type: ignore[index]

        # Parse JSON — will raise json.JSONDecodeError on malformed output
        parsed: dict[str, Any] = json.loads(raw_text)

        # Validate schema — will raise ValueError on any violation
        validated = _validate_ai_response(parsed, expected_report_id=inp.report_id)
        return validated

    def _build_assessment_from_ai(
        self,
        inp: ScoringInput,
        ai: dict[str, Any],
    ) -> PriorityAssessment:
        """Construct a PriorityAssessment from the validated AI response dict."""
        factor_values = FactorValues(
            severity=float(ai["severity"]),
            traffic_exposure=float(ai["traffic_exposure"]),
            road_importance=float(ai["road_importance"]),
            critical_facility=float(ai["critical_facility"]),
            urgency=float(ai["urgency"]),
        )

        score = round(float(ai["priority_score"]), 4)
        category = PriorityCategory(ai["priority_category"])

        # Append disclaimer to AI explanation
        explanation = (
            ai["explanation"].strip()
            + " [AI-assisted assessment — not a safety certification.]"
        )

        return PriorityAssessment(
            report_id=inp.report_id,
            priority_score=score,
            priority_category=category,
            factor_values=factor_values,
            explanation=explanation,
            uncertainty_flags=["Assessment produced by AI model; verify with field inspection."],
            policy_version=POLICY_VERSION,
            assessment_mode=AssessmentMode.AI_ASSISTED,
        )

    def _deterministic_fallback(
        self,
        inp: ScoringInput,
        reason: str,
    ) -> PriorityAssessment:
        logger.debug("Using deterministic fallback for report %s: %s", inp.report_id, reason)
        return self._deterministic.score(inp)


# Module-level singleton
ai_assessment_service = AIAssessmentService()
