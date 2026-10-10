import os
import logging
from typing import List, Dict, Any, Tuple
from pathlib import Path

# Note: Ultralytics may take time to import, so we import it globally but handle missing weights carefully
try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None

logger = logging.getLogger(__name__)

class DetectionService:
    def __init__(self, weights_path: str = "YOLO_WEIGHTS.pt"):
        self.weights_path = weights_path
        self.model = None
        self.model_version = "no-model"
        
        # Load the model if weights exist
        if os.path.exists(self.weights_path):
            if YOLO is None:
                logger.error("ultralytics is not installed, cannot load YOLO model.")
                return
            try:
                self.model = YOLO(self.weights_path)
                # Use filename as version proxy or a predefined string
                self.model_version = f"yolo11-{os.path.basename(self.weights_path)}"
                logger.info(f"Loaded YOLO model from {self.weights_path}")
            except Exception as e:
                logger.error(f"Failed to load YOLO model: {e}")
        else:
            logger.warning(f"YOLO weights not found at {self.weights_path}. Running in no-model/demo mode. No inference will occur.")

    def detect(self, image_path: str) -> List[Dict[str, Any]]:
        """
        Run inference on an image and return bounding boxes.
        Returns empty list if no model is loaded.
        """
        if self.model is None:
            # We are in demo mode/no model mode, never fabricate results
            return []
            
        results = self.model(image_path)
        
        detections = []
        for result in results:
            boxes = result.boxes
            for i in range(len(boxes)):
                box = boxes[i]
                
                # Get coordinates
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                
                # Get confidence
                conf = box.conf[0].item()
                
                # Get class index
                cls_idx = int(box.cls[0].item())
                class_name = self.model.names[cls_idx] if hasattr(self.model, 'names') else str(cls_idx)
                
                detections.append({
                    "class_name": class_name,
                    "confidence": conf,
                    "bbox_xmin": x1,
                    "bbox_ymin": y1,
                    "bbox_xmax": x2,
                    "bbox_ymax": y2,
                    "model_version": self.model_version
                })
                
        return detections

# Global instance initialized during startup
detection_service = None

def get_detection_service() -> DetectionService:
    global detection_service
    if detection_service is None:
        weights = os.getenv("YOLO_WEIGHTS", "yolo11n.pt")
        detection_service = DetectionService(weights)
    return detection_service
