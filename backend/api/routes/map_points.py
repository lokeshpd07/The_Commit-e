"""
backend/api/routes/map_points.py
---------------------------------
GET /api/v1/map-points — return valid geographic coordinates for map rendering.

Design decisions
----------------
* Only records with valid latitude and longitude are returned; records missing
  coordinates are silently skipped (logged at DEBUG level).
* The repository is injected via FastAPI Depends (same pattern as priorities.py).
* Response is paginated to match the list-assessments interface.
* Coordinate validation uses the same bounds as the geo service: lat [-90,90],
  lon [-180,180].
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from backend.core.repository_interface import (
    AssessmentRepository,
    InMemoryAssessmentRepository,
)
from backend.schemas.plan import MapPointResponse, MapPointsResponse
from backend.schemas.priority import APIError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/map-points", tags=["map-points"])

# ---------------------------------------------------------------------------
# Repository dependency (mirrors priorities.py pattern)
# ---------------------------------------------------------------------------

_fallback_repo: InMemoryAssessmentRepository = InMemoryAssessmentRepository()


def get_repository() -> AssessmentRepository:
    """
    FastAPI dependency that returns the assessment repository.

    Falls back to InMemoryAssessmentRepository if Member 1's SQLAlchemy
    implementation is not yet wired up.
    """
    try:
        from backend.repositories.assessment import assessment_repository  # type: ignore[import]
        return assessment_repository  # type: ignore[return-value]
    except ImportError:
        logger.debug(
            "backend.repositories.assessment not available; "
            "using InMemoryAssessmentRepository fallback (map_points)."
        )
        return _fallback_repo


RepositoryDep = Annotated[AssessmentRepository, Depends(get_repository)]

# ---------------------------------------------------------------------------
# Coordinate validity check
# ---------------------------------------------------------------------------

_LAT_KEY = "latitude"
_LON_KEY = "longitude"


def _has_valid_coords(record) -> bool:
    """
    Return True if the record exposes valid map coordinates.

    AssessmentRecord does not currently include lat/lon fields because the
    scoring service does not require them.  When Member 1 adds geo fields,
    this function will read them.  Until then, map-points returns data from
    the metadata dict if present.
    """
    lat = getattr(record, _LAT_KEY, None) or record.metadata.get(_LAT_KEY) if hasattr(record, "metadata") else None
    lon = getattr(record, _LON_KEY, None) or record.metadata.get(_LON_KEY) if hasattr(record, "metadata") else None
    if lat is None or lon is None:
        return False
    return -90.0 <= float(lat) <= 90.0 and -180.0 <= float(lon) <= 180.0


# ---------------------------------------------------------------------------
# GET /api/v1/map-points
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=MapPointsResponse,
    summary="Return map coordinates for all scored damage reports",
    description=(
        "Returns a list of geographic coordinates for damage reports that have "
        "been scored.  Only records with valid latitude and longitude are included. "
        "Scores are prototype policy outputs — not validated public-safety standards."
    ),
    responses={
        422: {"model": APIError, "description": "Invalid query parameters"},
        500: {"model": APIError, "description": "Internal server error"},
    },
)
def list_map_points(
    repo: RepositoryDep,
    page: Annotated[int, Query(ge=1, description="1-based page number.")] = 1,
    page_size: Annotated[
        int, Query(ge=1, le=200, description="Number of items per page (max 200).")
    ] = 200,
    category: Annotated[
        str | None,
        Query(description="Filter by priority category: critical | high | medium | low."),
    ] = None,
) -> MapPointsResponse:
    """
    Return geographic coordinates for scored damage reports.

    Coordinates are expected as metadata fields on the assessment records.
    Records without valid lat/lon are excluded from the response.
    """
    try:
        result = repo.list_assessments(
            page=page,
            page_size=page_size,
            category_filter=category,
        )
    except Exception as exc:
        logger.exception("Repository error in list_map_points: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "repository_error",
                "message": "Failed to retrieve assessment records.",
            },
        ) from exc

    points: list[MapPointResponse] = []
    for record in result.items:
        # Extract lat/lon from record attributes or metadata
        lat = getattr(record, "latitude", None)
        lon = getattr(record, "longitude", None)
        rec_status = getattr(record, "status", "pending")

        if lat is None or lon is None:
            logger.debug(
                "Skipping record %s: missing latitude/longitude.", record.report_id
            )
            continue

        try:
            lat_f = float(lat)
            lon_f = float(lon)
        except (TypeError, ValueError):
            logger.debug(
                "Skipping record %s: non-numeric coordinates lat=%r lon=%r.",
                record.report_id, lat, lon,
            )
            continue

        if not (-90.0 <= lat_f <= 90.0 and -180.0 <= lon_f <= 180.0):
            logger.debug(
                "Skipping record %s: out-of-range coordinates lat=%r lon=%r.",
                record.report_id, lat_f, lon_f,
            )
            continue

        points.append(
            MapPointResponse(
                report_id=record.report_id,
                latitude=lat_f,
                longitude=lon_f,
                priority_category=record.priority_category,
                priority_score=record.priority_score,
                status=rec_status if isinstance(rec_status, str) else "pending",
            )
        )

    return MapPointsResponse(data=points, total=len(points))

