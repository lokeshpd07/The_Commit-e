import pytest
import os
from backend.services.detection import DetectionService

def test_missing_yolo_weights():
    # Use a non-existent path
    service = DetectionService(weights_path="nonexistent_yolo.pt")
    assert service.model is None
    assert service.model_version == "no-model"
    
    # detect should return empty list without crashing
    results = service.detect("some_image.jpg")
    assert results == []

def test_extract_features():
    from backend.services.features import extract_features
    
    # Test empty
    empty_features = extract_features([])
    assert empty_features["pothole_count"] == 0
    assert empty_features["max_bbox_area"] == 0.0
    
    # Test with detections
    detections = [
        {"class_name": "pothole", "confidence": 0.8, "bbox_xmin": 10, "bbox_ymin": 10, "bbox_xmax": 20, "bbox_ymax": 20, "model_version": "v1"},
        {"class_name": "pothole", "confidence": 0.9, "bbox_xmin": 100, "bbox_ymin": 100, "bbox_xmax": 120, "bbox_ymax": 120, "model_version": "v1"}
    ]
    features = extract_features(detections)
    assert features["pothole_count"] == 2
    assert features["max_bbox_area"] == 400.0
    assert features["total_bbox_area"] == 500.0
    assert features["highest_confidence"] == 0.9
