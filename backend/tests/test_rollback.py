import pytest
from fastapi.testclient import TestClient
import io
from PIL import Image

from backend.main import app
from backend.db.session import SessionLocal, engine
from backend.models.base import Base
from backend.models.domain import Report

# Create tables for tests
Base.metadata.create_all(bind=engine)

client = TestClient(app)

def create_test_image(format="JPEG"):
    file = io.BytesIO()
    img = Image.new("RGB", (100, 100), color="red")
    img.save(file, format=format)
    file.seek(0)
    return file

def test_rollback_on_error(mocker):
    # Mock score_report to throw an error and verify rollback
    mocker.patch("backend.api.routes.reports.score_report", side_effect=Exception("Simulated error"))
    
    # Get count before
    with SessionLocal() as db:
        count_before = db.query(Report).count()
        
    img_file = create_test_image()
    response = client.post(
        "/api/v1/reports",
        files={"image": ("test.jpg", img_file, "image/jpeg")},
        data={"damage_severity": "moderate"}
    )
    
    assert response.status_code == 500
    
    # Check count didn't change
    with SessionLocal() as db:
        count_after = db.query(Report).count()
        
    assert count_before == count_after
