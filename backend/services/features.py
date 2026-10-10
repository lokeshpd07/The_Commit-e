from typing import List, Dict, Any

def extract_features(detections: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Extract features from detections to be used for assessment.
    Treats bounding-box area as a visual proxy for severity, not physical depth.
    """
    if not detections:
        return {
            "pothole_count": 0,
            "max_bbox_area": 0.0,
            "total_bbox_area": 0.0,
            "highest_confidence": 0.0
        }
        
    pothole_count = len(detections)
    max_area = 0.0
    total_area = 0.0
    max_conf = 0.0
    
    for det in detections:
        # Calculate area (width * height)
        width = det["bbox_xmax"] - det["bbox_xmin"]
        height = det["bbox_ymax"] - det["bbox_ymin"]
        area = width * height
        
        total_area += area
        if area > max_area:
            max_area = area
            
        if det["confidence"] > max_conf:
            max_conf = det["confidence"]
            
    return {
        "pothole_count": pothole_count,
        "max_bbox_area": max_area,
        "total_bbox_area": total_area,
        "highest_confidence": max_conf
    }
