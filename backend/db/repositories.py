from typing import List, Optional

from sqlalchemy.orm import Session
from sqlalchemy import select
import sqlalchemy

from backend.models.domain import Report, Assessment, Detection
from backend.core.repository_interface import AssessmentRecord, AssessmentPage

class AssessmentRepositoryImpl:
    """SQLAlchemy implementation of AssessmentRepository"""
    
    def __init__(self, session_factory):
        self.session_factory = session_factory

    def save(self, record: AssessmentRecord) -> AssessmentRecord:
        with self.session_factory() as db:
            assessment = db.scalars(select(Assessment).where(Assessment.report_id == record.report_id)).first()
            if not assessment:
                assessment = Assessment(report_id=record.report_id)
                db.add(assessment)
            
            assessment.priority_score = record.priority_score
            assessment.priority_category = record.priority_category
            assessment.assessment_mode = record.assessment_mode
            assessment.policy_version = record.policy_version
            assessment.explanation = record.explanation
            assessment.factor_severity = record.factor_severity
            assessment.factor_traffic_exposure = record.factor_traffic_exposure
            assessment.factor_road_importance = record.factor_road_importance
            assessment.factor_critical_facility = record.factor_critical_facility
            assessment.factor_urgency = record.factor_urgency
            assessment.uncertainty_flags = record.uncertainty_flags
            
            db.commit()
            return record

    def get_by_report_id(self, report_id: str) -> AssessmentRecord | None:
        with self.session_factory() as db:
            assessment = db.scalars(select(Assessment).where(Assessment.report_id == report_id)).first()
            if not assessment:
                return None
                
            return AssessmentRecord(
                report_id=assessment.report_id,
                priority_score=assessment.priority_score,
                priority_category=assessment.priority_category,
                assessment_mode=assessment.assessment_mode,
                policy_version=assessment.policy_version,
                explanation=assessment.explanation,
                factor_severity=assessment.factor_severity,
                factor_traffic_exposure=assessment.factor_traffic_exposure,
                factor_road_importance=assessment.factor_road_importance,
                factor_critical_facility=assessment.factor_critical_facility,
                factor_urgency=assessment.factor_urgency,
                uncertainty_flags=assessment.uncertainty_flags
            )

    def list_assessments(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        category_filter: str | None = None,
        mode_filter: str | None = None,
    ) -> AssessmentPage:
        with self.session_factory() as db:
            query = select(Assessment)
            
            if category_filter:
                query = query.where(Assessment.priority_category == category_filter)
            if mode_filter:
                query = query.where(Assessment.assessment_mode == mode_filter)
                
            query = query.order_by(Assessment.priority_score.desc())
            
            # execute
            assessments = db.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()
            
            count_query = select(sqlalchemy.func.count()).select_from(Assessment)
            if category_filter:
                count_query = count_query.where(Assessment.priority_category == category_filter)
            if mode_filter:
                count_query = count_query.where(Assessment.assessment_mode == mode_filter)
                
            total_items = db.scalar(count_query) or 0
            
            records = [
                AssessmentRecord(
                    report_id=a.report_id,
                    priority_score=a.priority_score,
                    priority_category=a.priority_category,
                    assessment_mode=a.assessment_mode,
                    policy_version=a.policy_version,
                    explanation=a.explanation,
                    factor_severity=a.factor_severity,
                    factor_traffic_exposure=a.factor_traffic_exposure,
                    factor_road_importance=a.factor_road_importance,
                    factor_critical_facility=a.factor_critical_facility,
                    factor_urgency=a.factor_urgency,
                    uncertainty_flags=a.uncertainty_flags
                )
                for a in assessments
            ]
            
            return AssessmentPage(
                items=records,
                total_items=total_items,
                page=page,
                page_size=page_size
            )


class ReportRepository:
    """Repository for Reports"""
    def __init__(self, session_factory):
        self.session_factory = session_factory
