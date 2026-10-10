"""
backend/services/geo.py
-----------------------
Geographic clustering service for RoadSense AI.

Uses DBSCAN with the haversine metric to group nearby road-damage reports into
spatial clusters.  Clusters are purely spatial proximity groups; they do NOT
imply road connectivity, shared driving routes, or any topological relationship.

Haversine DBSCAN unit convention
---------------------------------
scikit-learn's haversine metric expects coordinates in **radians** and returns
distances in **radians** (where 1 radian ≈ 6 371 km = Earth's mean radius).
The configured radius is therefore converted:

    eps_radians = radius_metres / EARTH_RADIUS_METRES

Noise label
-----------
DBSCAN assigns cluster label -1 to points that are neither core points nor
reachable from a core point.  These are treated as individual unclustered
points—NOT merged into a single shared "noise cluster".  Each noise point is
reported separately with cluster_id = None.

Assumptions (documented, not hidden)
--------------------------------------
1. Earth is modelled as a sphere of radius 6 371 000 m.  Ellipsoidal correction
   is negligible for the neighbourhood radii used in road-maintenance planning.
2. Coordinate validation is strict: latitude must be in [-90, 90] and longitude
   in [-180, 180].  Out-of-range values raise ValueError before clustering.
3. An empty input list returns an empty result without error.
4. Single-point inputs always produce a noise point (no cluster formed) because
   min_samples > 1 by default.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Final, Sequence

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EARTH_RADIUS_METRES: Final[float] = 6_371_000.0
"""Mean Earth radius used for haversine ↔ metre conversion."""

# ---------------------------------------------------------------------------
# Default clustering parameters (can be overridden per call)
# ---------------------------------------------------------------------------

DEFAULT_RADIUS_METRES: Final[float] = 200.0
"""Default neighbourhood radius: 200 m."""

DEFAULT_MIN_SAMPLES: Final[int] = 2
"""Default minimum core-point neighbour count."""

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class GeoPoint:
    """
    A single geographic coordinate with an associated identifier.

    Parameters
    ----------
    point_id:
        Stable identifier (e.g. report_id or damage_id).
    latitude:
        Decimal degrees, must be in [-90, 90].
    longitude:
        Decimal degrees, must be in [-180, 180].
    """

    point_id: str
    latitude: float
    longitude: float

    def __post_init__(self) -> None:
        _validate_latitude(self.latitude, self.point_id)
        _validate_longitude(self.longitude, self.point_id)


@dataclass
class ClusteredPoint:
    """A GeoPoint annotated with its DBSCAN cluster assignment."""

    point_id: str
    latitude: float
    longitude: float
    cluster_id: int | None
    """
    Integer cluster index (0-based) or None if the point is unclustered
    (DBSCAN noise label -1).  None is used rather than -1 to avoid
    callers treating noise as a valid cluster.
    """


@dataclass
class ClusterResult:
    """
    Full output of a single clustering run.

    Attributes
    ----------
    points:
        All input points annotated with cluster assignments.
    n_clusters:
        Number of distinct spatial clusters found (excludes noise).
    n_noise:
        Number of points that could not be assigned to any cluster.
    radius_metres:
        The neighbourhood radius that was used (for audit purposes).
    min_samples:
        The min_samples parameter that was used.
    """

    points: list[ClusteredPoint]
    n_clusters: int
    n_noise: int
    radius_metres: float
    min_samples: int
    note: str = (
        "Clusters represent spatial proximity only. "
        "They do not indicate road connectivity or valid driving routes."
    )


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------


def _validate_latitude(lat: float, point_id: str = "") -> None:
    """Raise ValueError if latitude is outside [-90, 90]."""
    if not (-90.0 <= lat <= 90.0):
        raise ValueError(
            f"Invalid latitude {lat!r} for point '{point_id}'. "
            "Latitude must be in [-90, 90]."
        )


def _validate_longitude(lon: float, point_id: str = "") -> None:
    """Raise ValueError if longitude is outside [-180, 180]."""
    if not (-180.0 <= lon <= 180.0):
        raise ValueError(
            f"Invalid longitude {lon!r} for point '{point_id}'. "
            "Longitude must be in [-180, 180]."
        )


# ---------------------------------------------------------------------------
# Unit conversion
# ---------------------------------------------------------------------------


def metres_to_radians(metres: float) -> float:
    """
    Convert a distance in metres to radians on a spherical Earth.

    This is the unit that scikit-learn's haversine DBSCAN expects for `eps`.

    Parameters
    ----------
    metres:
        Distance in metres (must be non-negative).

    Returns
    -------
    float
        Distance in radians.
    """
    if metres < 0:
        raise ValueError(f"Distance must be non-negative; got {metres!r} metres.")
    return metres / EARTH_RADIUS_METRES


def radians_to_metres(radians: float) -> float:
    """
    Convert a haversine distance in radians back to metres.

    Parameters
    ----------
    radians:
        Distance in radians (must be non-negative).

    Returns
    -------
    float
        Distance in metres.
    """
    if radians < 0:
        raise ValueError(f"Distance must be non-negative; got {radians!r} radians.")
    return radians * EARTH_RADIUS_METRES


# ---------------------------------------------------------------------------
# Haversine distance (used in tests and planner adjacency checks)
# ---------------------------------------------------------------------------


def haversine_metres(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Compute the great-circle distance between two points in metres.

    Uses the haversine formula on a spherical Earth of radius
    EARTH_RADIUS_METRES.

    Parameters
    ----------
    lat1, lon1, lat2, lon2:
        Coordinates in decimal degrees.

    Returns
    -------
    float
        Distance in metres.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    return EARTH_RADIUS_METRES * c


# ---------------------------------------------------------------------------
# Public clustering API
# ---------------------------------------------------------------------------


class GeoClusteringService:
    """
    Stateless geographic clustering service.

    Wraps scikit-learn's DBSCAN with the haversine metric for use with
    latitude/longitude coordinates.  A new instance can be created per request
    or reused as a singleton; there is no mutable state.
    """

    def cluster(
        self,
        points: Sequence[GeoPoint],
        *,
        radius_metres: float = DEFAULT_RADIUS_METRES,
        min_samples: int = DEFAULT_MIN_SAMPLES,
    ) -> ClusterResult:
        """
        Cluster geographic points using DBSCAN (haversine metric).

        Parameters
        ----------
        points:
            Sequence of validated GeoPoint objects.  Coordinates are validated
            again inside this method to guard against partial-construction bugs.
        radius_metres:
            Neighbourhood radius in metres (converted to radians internally).
            Must be positive.
        min_samples:
            Minimum number of points required to form a dense region (core
            point).  Must be >= 1.

        Returns
        -------
        ClusterResult
            Contains every input point annotated with its cluster assignment.
            Noise points have cluster_id = None.

        Raises
        ------
        ValueError
            If radius_metres <= 0, min_samples < 1, or any coordinate is
            out of range.
        """
        if radius_metres <= 0:
            raise ValueError(
                f"radius_metres must be positive; got {radius_metres!r}."
            )
        if min_samples < 1:
            raise ValueError(
                f"min_samples must be >= 1; got {min_samples!r}."
            )

        # Re-validate all coordinates before clustering
        for pt in points:
            _validate_latitude(pt.latitude, pt.point_id)
            _validate_longitude(pt.longitude, pt.point_id)

        # Handle empty input
        if not points:
            logger.debug("GeoClusteringService.cluster: empty input; returning empty result.")
            return ClusterResult(
                points=[],
                n_clusters=0,
                n_noise=0,
                radius_metres=radius_metres,
                min_samples=min_samples,
            )

        eps_radians = metres_to_radians(radius_metres)

        # Build coordinate array in radians (haversine expects [lat, lon] in radians)
        coords_rad = np.array(
            [[math.radians(p.latitude), math.radians(p.longitude)] for p in points],
            dtype=np.float64,
        )

        try:
            from sklearn.cluster import DBSCAN
        except ImportError as exc:
            raise ImportError(
                "scikit-learn is required for geographic clustering. "
                "Install it with: pip install scikit-learn"
            ) from exc

        db = DBSCAN(
            eps=eps_radians,
            min_samples=min_samples,
            algorithm="ball_tree",
            metric="haversine",
        )
        raw_labels: np.ndarray = db.fit_predict(coords_rad)

        # Convert raw labels to ClusteredPoint objects
        # DBSCAN label -1 → cluster_id = None (unclustered / noise)
        clustered: list[ClusteredPoint] = []
        for pt, raw_label in zip(points, raw_labels):
            cluster_id = int(raw_label) if raw_label != -1 else None
            clustered.append(
                ClusteredPoint(
                    point_id=pt.point_id,
                    latitude=pt.latitude,
                    longitude=pt.longitude,
                    cluster_id=cluster_id,
                )
            )

        n_clusters = len({cp.cluster_id for cp in clustered if cp.cluster_id is not None})
        n_noise = sum(1 for cp in clustered if cp.cluster_id is None)

        logger.info(
            "Clustered %d points → %d cluster(s), %d noise point(s) "
            "(radius=%.1fm, min_samples=%d).",
            len(points),
            n_clusters,
            n_noise,
            radius_metres,
            min_samples,
        )

        return ClusterResult(
            points=clustered,
            n_clusters=n_clusters,
            n_noise=n_noise,
            radius_metres=radius_metres,
            min_samples=min_samples,
        )


# Module-level singleton
geo_clustering_service = GeoClusteringService()

