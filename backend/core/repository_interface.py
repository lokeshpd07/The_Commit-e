"""
backend/core/repository_interface.py
--------------------------------------
Protocol definition for the assessment repository.

Member 1 owns the concrete SQLAlchemy implementation.  This file defines only
the interface that Member 2's route and service code depend on, so both members
can develop in parallel without tight coupling.

Coordination notes (to be resolved with Member 1)
--------------------------------------------------
* The concrete implementation must be importable as
      from backend.repositories.assessment import assessment_repository
  and must satisfy the AssessmentRepository protocol below.
* Field names in AssessmentRecord mirror the PriorityAssessment schema.
  If Member 1 uses different column names the repository adapter should
  translate them before returning AssessmentRecord objects.
* Pagination uses 1-based page numbers; page_size defaults to 20.
* Filters are passed as keyword arguments; unsupported filters are ignored
  (not raised as errors) to allow incremental feature rollout.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


@dataclass
class AssessmentRecord:
    """
    Plain-data container for a persisted priority assessment.

    All fields correspond 1-to-1 with PriorityAssessment schema fields to make
    conversion trivial in the route layer.
    """

    report_id: str
    priority_score: float
    priority_category: str          # stored as string; converted to enum at schema layer
    assessment_mode: str            # "deterministic" | "ai_assisted"
    policy_version: str
    explanation: str
    factor_severity: float
    factor_traffic_exposure: float
    factor_road_importance: float
    factor_critical_facility: float
    factor_urgency: float
    uncertainty_flags: list[str] = field(default_factory=list)


@dataclass
class AssessmentPage:
    """Paginated result from the repository."""

    items: list[AssessmentRecord]
    total_items: int
    page: int
    page_size: int


@runtime_checkable
class AssessmentRepository(Protocol):
    """
    Repository interface for priority assessments.

    Implementations must be provided by Member 1 (concrete SQLAlchemy) or a test
    double (InMemoryAssessmentRepository defined below).
    """

    def save(self, record: AssessmentRecord) -> AssessmentRecord:
        """Persist a new assessment and return it (with any DB-assigned fields)."""
        ...

    def get_by_report_id(self, report_id: str) -> AssessmentRecord | None:
        """Return the latest assessment for the given report, or None."""
        ...

    def list_assessments(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        category_filter: str | None = None,
        mode_filter: str | None = None,
    ) -> AssessmentPage:
        """
        Return a paginated, score-descending list of assessments.

        Parameters
        ----------
        page
            1-based page number.
        page_size
            Items per page (1–200).
        category_filter
            If provided, restrict results to this priority category.
        mode_filter
            If provided, restrict results to this assessment mode.
        """
        ...


# ---------------------------------------------------------------------------
# In-memory test double (used by tests and as a fallback when the real
# repository is not yet wired up)
# ---------------------------------------------------------------------------


class InMemoryAssessmentRepository:
    """
    Simple in-memory repository satisfying the AssessmentRepository protocol.

    Suitable for unit tests and local development without a database.
    Thread-safety is not guaranteed; use only in single-threaded test contexts.
    """

    def __init__(self) -> None:
        self._store: dict[str, AssessmentRecord] = {}

    def save(self, record: AssessmentRecord) -> AssessmentRecord:
        self._store[record.report_id] = record
        return record

    def get_by_report_id(self, report_id: str) -> AssessmentRecord | None:
        return self._store.get(report_id)

    def list_assessments(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        category_filter: str | None = None,
        mode_filter: str | None = None,
    ) -> AssessmentPage:
        items = list(self._store.values())

        if category_filter:
            items = [r for r in items if r.priority_category == category_filter]
        if mode_filter:
            items = [r for r in items if r.assessment_mode == mode_filter]

        # Sort by priority score descending (stable sort preserves insertion order
        # for ties, which is deterministic for reproducible tests)
        items.sort(key=lambda r: r.priority_score, reverse=True)

        total = len(items)
        start = (page - 1) * page_size
        end = start + page_size
        page_items = items[start:end]

        return AssessmentPage(
            items=page_items,
            total_items=total,
            page=page,
            page_size=page_size,
        )
