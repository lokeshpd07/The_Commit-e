import os
import uuid
import shutil
from typing import Optional
from PIL import Image

from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Query, status
from fastapi.responses import JSONResponse

from backend.db.session import SessionLocal
from backend.models.domain import Report, DamageLocation, Detection, Assessment
from backend.schemas.report import ReportResponse, ReportListResponse, DamageLocationSchema, DetectionSchema
from backend.services.detection import get_detection_service
from backend.services.features import extract_features
from backend.schemas.priority import ScoringInput
from backend.api.routes.priorities import score_report

from sqlalchemy import select
from sqlalchemy.orm import selectinload

router = APIRouter(prefix="/reports", tags=["reports"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
MAX_FILE_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", 10 * 1024 * 1024)) # 10MB default
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
def create_report(
    image: UploadFile = File(...),
    latitude: float = Form(0.0),
    longitude: float = Form(0.0),
    damage_severity: str = Form("moderate"),
    traffic_volume: str = Form("medium"),
    road_type: str = Form("residential"),
    critical_facility_proximity: str = Form("none"),
    use_ai: bool = Form(False)
):
    # Validate image file
    if image.content_type not in ["image/jpeg", "image/png"]:
        raise HTTPException(status_code=400, detail="Only JPEG and PNG are allowed.")
        
    # Read size and content
    contents = image.file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Image exceeds maximum size of 10MB.")
        
    # Save temporarily to validate with Pillow
    temp_filename = f"temp_{uuid.uuid4()}.tmp"
    temp_path = os.path.join(UPLOAD_DIR, temp_filename)
    with open(temp_path, "wb") as f:
        f.write(contents)
        
    try:
        with Image.open(temp_path) as img:
            img.verify() # Validate actual content
    except Exception:
        os.remove(temp_path)
        raise HTTPException(status_code=400, detail="Corrupted or invalid image file.")
        
    # Valid image, rename to safe filename
    ext = ".png" if image.content_type == "image/png" else ".jpg"
    safe_filename = f"{uuid.uuid4()}{ext}"
    safe_path = os.path.join(UPLOAD_DIR, safe_filename)
    os.rename(temp_path, safe_path)
    
    # Run YOLO detection
    det_service = get_detection_service()
    det_results = det_service.detect(safe_path)
    
    # Extract features
    features = extract_features(det_results)
    
    with SessionLocal() as db:
        try:
            # Create Report
            report = Report(image_filename=safe_filename, status="processed")
            db.add(report)
            db.flush() # get report.id
            
            # Create Location
            loc = DamageLocation(report_id=report.id, latitude=latitude, longitude=longitude)
            db.add(loc)
            
            # Create Detections
            db_detections = []
            for det in det_results:
                db_det = Detection(
                    report_id=report.id,
                    class_name=det["class_name"],
                    confidence=det["confidence"],
                    bbox_xmin=det["bbox_xmin"],
                    bbox_ymin=det["bbox_ymin"],
                    bbox_xmax=det["bbox_xmax"],
                    bbox_ymax=det["bbox_ymax"],
                    model_version=det["model_version"]
                )
                db.add(db_det)
                db_detections.append(db_det)
                
            # Delegate scoring to Member 2's logic
            # Using repository import to avoid recursive injection issues
            from backend.repositories.assessment import assessment_repository
            
            scoring_input = ScoringInput(
                report_id=report.id,
                damage_severity=damage_severity,
                traffic_volume=traffic_volume,
                road_type=road_type,
                critical_facility_proximity=critical_facility_proximity,
                days_since_report=0,
                complaint_count=0
            )
            
            assessment_result = score_report(
                scoring_input=scoring_input,
                repo=assessment_repository,
                use_ai=use_ai,
                persist=True # We will let the repo persist it, wait, repository has its own session? 
                # Our AssessmentRepositoryImpl opens a new session. It's safer to save it manually in this transaction to prevent partial saves.
            )
            
            # Since AssessmentRepositoryImpl opens its own session, the assessment is committed outside this transaction. 
            # This violates "implement transactions so related report, detection, and assessment records do not get partially saved".
            # So instead of persist=True, we persist it in this transaction!
            
            assessment_result = score_report(
                scoring_input=scoring_input,
                repo=assessment_repository,
                use_ai=use_ai,
                persist=False 
            )
            
            db_assessment = Assessment(
                report_id=report.id,
                priority_score=assessment_result.priority_score,
                priority_category=assessment_result.priority_category.value if hasattr(assessment_result.priority_category, "value") else assessment_result.priority_category,
                assessment_mode=assessment_result.assessment_mode.value if hasattr(assessment_result.assessment_mode, "value") else assessment_result.assessment_mode,
                policy_version=assessment_result.policy_version,
                explanation=assessment_result.explanation,
                factor_severity=assessment_result.factor_values.severity,
                factor_traffic_exposure=assessment_result.factor_values.traffic_exposure,
                factor_road_importance=assessment_result.factor_values.road_importance,
                factor_critical_facility=assessment_result.factor_values.critical_facility,
                factor_urgency=assessment_result.factor_values.urgency,
                uncertainty_flags=assessment_result.uncertainty_flags
            )
            db.add(db_assessment)
            
            db.commit()
            db.refresh(report)
            
            # Format output
            return ReportResponse(
                id=report.id,
                status=report.status,
                created_at=report.created_at,
                image_filename=report.image_filename,
                location=DamageLocationSchema(latitude=latitude, longitude=longitude),
                detections=[
                    DetectionSchema(
                        class_name=d.class_name,
                        confidence=d.confidence,
                        bbox_xmin=d.bbox_xmin,
                        bbox_ymin=d.bbox_ymin,
                        bbox_xmax=d.bbox_xmax,
                        bbox_ymax=d.bbox_ymax,
                        model_version=d.model_version
                    ) for d in db_detections
                ]
            )
            
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=ReportListResponse)
def list_reports(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100)
):
    with SessionLocal() as db:
        query = select(Report).order_by(Report.created_at.desc())
        
        reports = db.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()
        import sqlalchemy
        total_items = db.scalar(select(sqlalchemy.func.count()).select_from(Report)) or 0
        
        return ReportListResponse(
            items=[
                ReportResponse(
                    id=r.id,
                    status=r.status,
                    created_at=r.created_at,
                    image_filename=r.image_filename,
                    location=None, # In list view, avoid eagerly loading related models if not needed
                    detections=[]
                ) for r in reports
            ],
            total_items=total_items,
            page=page,
            page_size=page_size
        )


@router.get("/{report_id}", response_model=ReportResponse)
def get_report(report_id: str):
    with SessionLocal() as db:
        query = select(Report).options(
            selectinload(Report.location),
            selectinload(Report.detections)
        ).where(Report.id == report_id)
        
        report = db.scalars(query).first()
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
            
        location = DamageLocationSchema.model_validate(report.location) if report.location else None
        detections = [DetectionSchema.model_validate(d) for d in report.detections]
            
        return ReportResponse(
            id=report.id,
            status=report.status,
            created_at=report.created_at,
            image_filename=report.image_filename,
            location=location,
            detections=detections
        )
