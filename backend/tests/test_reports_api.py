import pytest
from fastapi.testclient import TestClient
import io
from PIL import Image

from backend.main import app
from backend.models.base import Base
from backend.db.session import engine

# Create tables for tests
Base.metadata.create_all(bind=engine)

client = TestClient(app)

def create_test_image(format="JPEG"):
    file = io.BytesIO()
    img = Image.new("RGB", (100, 100), color="red")
    img.save(file, format=format)
    file.seek(0)
    return file

def test_healthz():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["database"] == "ok"

def test_create_report_invalid_image():
    response = client.post(
        "/api/v1/reports",
        files={"image": ("test.txt", b"not an image", "text/plain")},
        data={"damage_severity": "moderate"}
    )
    assert response.status_code == 400

def test_create_report_corrupt_image():
    response = client.post(
        "/api/v1/reports",
        files={"image": ("test.jpg", b"corrupted data that is not a valid jpeg", "image/jpeg")},
        data={"damage_severity": "moderate"}
    )
    assert response.status_code == 400

def test_create_report_valid():
    img_file = create_test_image()
    response = client.post(
        "/api/v1/reports",
        files={"image": ("test.jpg", img_file, "image/jpeg")},
        data={
            "latitude": 40.7128,
            "longitude": -74.0060,
            "damage_severity": "moderate",
            "traffic_volume": "medium",
            "road_type": "residential",
            "critical_facility_proximity": "none"
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["location"]["latitude"] == 40.7128
    
    # Test GET by ID
    report_id = data["id"]
    response2 = client.get(f"/api/v1/reports/{report_id}")
    assert response2.status_code == 200
    assert response2.json()["id"] == report_id

def test_get_report_not_found():
    response = client.get("/api/v1/reports/nonexistent-id")
    assert response.status_code == 404

def test_list_reports_pagination():
    response = client.get("/api/v1/reports?page=1&page_size=10")
    assert response.status_code == 200
    assert "items" in response.json()
    assert "total_items" in response.json()
