"""
backend/tests/test_geo.py
--------------------------
Unit tests for backend/services/geo.py.

Coverage
--------
  ✓ Valid coordinate acceptance (full range)
  ✓ Invalid latitude rejection (< -90, > 90)
  ✓ Invalid longitude rejection (< -180, > 180)
  ✓ Haversine distance conversion (metres ↔ radians)
  ✓ haversine_metres formula correctness
  ✓ Empty input → empty ClusterResult
  ✓ Single point → noise (cluster_id = None)
  ✓ Two nearby points → same cluster
  ✓ Two far-apart points → two noise points (below min_samples)
  ✓ DBSCAN noise label -1 treated as None, not merged into one cluster
  ✓ Clustered points → non-None cluster_id
  ✓ n_clusters and n_noise counts
  ✓ Invalid radius (≤ 0) raises ValueError
  ✓ Invalid min_samples (< 1) raises ValueError
  ✓ ClusterResult note does not claim road connectivity
"""

from __future__ import annotations

import math

import pytest

from backend.services.geo import (
    DEFAULT_MIN_SAMPLES,
    DEFAULT_RADIUS_METRES,
    EARTH_RADIUS_METRES,
    ClusterResult,
    GeoClusteringService,
    GeoPoint,
    geo_clustering_service,
    haversine_metres,
    metres_to_radians,
    radians_to_metres,
    _validate_latitude,
    _validate_longitude,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def make_point(pid: str, lat: float, lon: float) -> GeoPoint:
    return GeoPoint(point_id=pid, latitude=lat, longitude=lon)


# London: 51.5074, -0.1278
LONDON = (51.5074, -0.1278)
# 50 m north of London
LONDON_NEARBY = (51.5079, -0.1278)
# Manchester: 53.4808, -2.2426  (~262 km from London)
MANCHESTER = (53.4808, -2.2426)


# ---------------------------------------------------------------------------
# 1. Coordinate validation
# ---------------------------------------------------------------------------


class TestCoordinateValidation:
    @pytest.mark.parametrize("lat", [0.0, -90.0, 90.0, 45.0, -45.0])
    def test_valid_latitude_accepted(self, lat):
        _validate_latitude(lat, "test")  # Should not raise

    @pytest.mark.parametrize("lat", [-90.001, 90.001, 180.0, -180.0, float("inf")])
    def test_invalid_latitude_raises(self, lat):
        with pytest.raises(ValueError, match="latitude"):
            _validate_latitude(lat, "test-point")

    @pytest.mark.parametrize("lon", [0.0, -180.0, 180.0, 90.0, -90.0])
    def test_valid_longitude_accepted(self, lon):
        _validate_longitude(lon, "test")  # Should not raise

    @pytest.mark.parametrize("lon", [-180.001, 180.001, 360.0, -360.0])
    def test_invalid_longitude_raises(self, lon):
        with pytest.raises(ValueError, match="longitude"):
            _validate_longitude(lon, "test-point")

    def test_geopoint_invalid_lat_rejected(self):
        with pytest.raises(ValueError, match="latitude"):
            GeoPoint(point_id="bad", latitude=91.0, longitude=0.0)

    def test_geopoint_invalid_lon_rejected(self):
        with pytest.raises(ValueError, match="longitude"):
            GeoPoint(point_id="bad", latitude=0.0, longitude=181.0)

    def test_geopoint_valid_construction(self):
        pt = GeoPoint(point_id="ok", latitude=51.5, longitude=-0.1)
        assert pt.latitude == 51.5
        assert pt.longitude == -0.1

    def test_cluster_service_re_validates_coordinates(self):
        """cluster() should raise even if GeoPoint somehow bypasses __post_init__."""
        svc = GeoClusteringService()
        # Build an invalid point by bypassing __post_init__
        bad = object.__new__(GeoPoint)
        bad.point_id = "bad"
        bad.latitude = 95.0   # invalid
        bad.longitude = 0.0
        with pytest.raises(ValueError, match="latitude"):
            svc.cluster([bad])


# ---------------------------------------------------------------------------
# 2. Haversine distance conversion
# ---------------------------------------------------------------------------


class TestHaversineConversion:
    def test_metres_to_radians_zero(self):
        assert metres_to_radians(0.0) == 0.0

    def test_metres_to_radians_one_earth_radius(self):
        assert math.isclose(metres_to_radians(EARTH_RADIUS_METRES), 1.0, rel_tol=1e-9)

    def test_radians_to_metres_roundtrip(self):
        m = 350.0
        assert math.isclose(radians_to_metres(metres_to_radians(m)), m, rel_tol=1e-9)

    def test_200m_converts_correctly(self):
        r = metres_to_radians(200.0)
        assert math.isclose(r, 200.0 / EARTH_RADIUS_METRES, rel_tol=1e-9)

    def test_negative_metres_raises(self):
        with pytest.raises(ValueError):
            metres_to_radians(-1.0)

    def test_negative_radians_raises(self):
        with pytest.raises(ValueError):
            radians_to_metres(-0.001)


class TestHaversineDistance:
    def test_same_point_zero_distance(self):
        d = haversine_metres(51.5, -0.1, 51.5, -0.1)
        assert d == pytest.approx(0.0, abs=1e-6)

    def test_london_to_manchester_approx(self):
        """London to Manchester is ~262 km."""
        d = haversine_metres(*LONDON, *MANCHESTER)
        assert 250_000 < d < 275_000

    def test_small_distance_accurate(self):
        """Two points 1 degree of latitude apart ≈ 111 195 m."""
        d = haversine_metres(0.0, 0.0, 1.0, 0.0)
        assert math.isclose(d, 111_195.0, rel_tol=0.01)

    def test_symmetry(self):
        d1 = haversine_metres(*LONDON, *MANCHESTER)
        d2 = haversine_metres(*MANCHESTER, *LONDON)
        assert math.isclose(d1, d2, rel_tol=1e-9)

    def test_nearby_points_short_distance(self):
        """London and LONDON_NEARBY should be roughly 55 m apart."""
        d = haversine_metres(*LONDON, *LONDON_NEARBY)
        assert 40.0 < d < 70.0


# ---------------------------------------------------------------------------
# 3. Clustering — empty and single-point inputs
# ---------------------------------------------------------------------------


class TestEdgeCaseClustering:
    def test_empty_input_returns_empty_result(self):
        result = geo_clustering_service.cluster([])
        assert isinstance(result, ClusterResult)
        assert result.points == []
        assert result.n_clusters == 0
        assert result.n_noise == 0

    def test_single_point_is_noise(self):
        pts = [make_point("A", *LONDON)]
        result = geo_clustering_service.cluster(pts, min_samples=2)
        assert len(result.points) == 1
        assert result.points[0].cluster_id is None   # noise → None, not -1
        assert result.n_clusters == 0
        assert result.n_noise == 1

    def test_single_point_min_samples_1_forms_cluster(self):
        """With min_samples=1, even a single point is a core point."""
        pts = [make_point("A", *LONDON)]
        result = geo_clustering_service.cluster(pts, min_samples=1)
        assert result.points[0].cluster_id is not None
        assert result.n_clusters == 1
        assert result.n_noise == 0


# ---------------------------------------------------------------------------
# 4. Clustering — nearby and far-apart points
# ---------------------------------------------------------------------------


class TestClusteringBehaviour:
    def test_two_nearby_points_form_one_cluster(self):
        """Two points ~50 m apart with radius=200 m should form a cluster."""
        pts = [
            make_point("A", *LONDON),
            make_point("B", *LONDON_NEARBY),
        ]
        result = geo_clustering_service.cluster(pts, radius_metres=200.0, min_samples=2)
        ids = {cp.cluster_id for cp in result.points}
        assert None not in ids, "Both points should be in a cluster"
        assert result.n_clusters == 1
        assert result.n_noise == 0

    def test_two_far_apart_points_are_both_noise(self):
        """London and Manchester (≈262 km) with radius=500 m → both noise."""
        pts = [
            make_point("London", *LONDON),
            make_point("Manchester", *MANCHESTER),
        ]
        result = geo_clustering_service.cluster(pts, radius_metres=500.0, min_samples=2)
        assert all(cp.cluster_id is None for cp in result.points)
        assert result.n_clusters == 0
        assert result.n_noise == 2

    def test_noise_points_are_not_merged_into_shared_cluster(self):
        """Noise label -1 must produce cluster_id=None for each noise point individually."""
        pts = [
            make_point("A", 0.0, 0.0),
            make_point("B", 10.0, 10.0),
            make_point("C", 20.0, 20.0),
        ]
        # radius 1 m → all isolated noise
        result = geo_clustering_service.cluster(pts, radius_metres=1.0, min_samples=2)
        for cp in result.points:
            assert cp.cluster_id is None, (
                f"Point {cp.point_id} should be noise (None), not a merged cluster"
            )
        assert result.n_clusters == 0
        assert result.n_noise == 3

    def test_mixed_cluster_and_noise(self):
        """Two nearby points cluster; one far point is noise."""
        pts = [
            make_point("A", *LONDON),
            make_point("B", *LONDON_NEARBY),
            make_point("C", *MANCHESTER),
        ]
        result = geo_clustering_service.cluster(pts, radius_metres=200.0, min_samples=2)
        ids = {cp.cluster_id for cp in result.points if cp.cluster_id is not None}
        noise = [cp for cp in result.points if cp.cluster_id is None]
        assert len(ids) == 1, "One cluster expected"
        assert len(noise) == 1, "One noise point expected"
        assert noise[0].point_id == "C"
        assert result.n_clusters == 1
        assert result.n_noise == 1

    def test_cluster_ids_are_integers(self):
        pts = [make_point("A", *LONDON), make_point("B", *LONDON_NEARBY)]
        result = geo_clustering_service.cluster(pts, radius_metres=200.0, min_samples=2)
        for cp in result.points:
            if cp.cluster_id is not None:
                assert isinstance(cp.cluster_id, int)

    def test_points_order_preserved(self):
        """Output point ordering matches input ordering."""
        pts = [
            make_point("X", *LONDON),
            make_point("Y", *LONDON_NEARBY),
            make_point("Z", *MANCHESTER),
        ]
        result = geo_clustering_service.cluster(pts, radius_metres=200.0, min_samples=2)
        assert [cp.point_id for cp in result.points] == ["X", "Y", "Z"]

    def test_cluster_note_does_not_claim_road_connectivity(self):
        """The result note must not assert road connectivity."""
        result = geo_clustering_service.cluster([], radius_metres=200.0)
        note_lower = result.note.lower()
        assert "proximity" in note_lower
        # Ensure we don't falsely claim connectivity
        assert "road connectivity" in note_lower or "do not" in note_lower


# ---------------------------------------------------------------------------
# 5. Parameter validation
# ---------------------------------------------------------------------------


class TestParameterValidation:
    def test_zero_radius_raises(self):
        with pytest.raises(ValueError, match="radius_metres"):
            geo_clustering_service.cluster([], radius_metres=0.0)

    def test_negative_radius_raises(self):
        with pytest.raises(ValueError, match="radius_metres"):
            geo_clustering_service.cluster([], radius_metres=-100.0)

    def test_zero_min_samples_raises(self):
        with pytest.raises(ValueError, match="min_samples"):
            geo_clustering_service.cluster([], min_samples=0)

    def test_negative_min_samples_raises(self):
        with pytest.raises(ValueError, match="min_samples"):
            geo_clustering_service.cluster([], min_samples=-1)

    def test_cluster_result_radius_recorded(self):
        result = geo_clustering_service.cluster([], radius_metres=350.0)
        assert result.radius_metres == 350.0

    def test_cluster_result_min_samples_recorded(self):
        result = geo_clustering_service.cluster([], min_samples=3)
        assert result.min_samples == 3

