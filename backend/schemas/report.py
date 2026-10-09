from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

class DamageLocationSchema(BaseModel):
    latitude: float
    longitude: float
    
    model_config = ConfigDict(from_attributes=True)

class DetectionSchema(BaseModel):
    class_name: str
    confidence: float
    bbox_xmin: float
    bbox_ymin: float
    bbox_xmax: float
    bbox_ymax: float
    model_version: str
    
    model_config = ConfigDict(from_attributes=True)

class ReportBase(BaseModel):
    status: str
    created_at: datetime
    
class ReportResponse(ReportBase):
    id: str
    image_filename: str
    location: Optional[DamageLocationSchema] = None
    detections: List[DetectionSchema] = Field(default_factory=list)
    
    model_config = ConfigDict(from_attributes=True)

class ReportListResponse(BaseModel):
    items: List[ReportResponse]
    total_items: int
    page: int
    page_size: int
