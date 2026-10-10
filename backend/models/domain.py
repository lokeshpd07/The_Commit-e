import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import Column, String, Float, Integer, Boolean, JSON, ForeignKey, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

def generate_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class Report(Base):
    __tablename__ = "reports"
    
    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    image_filename: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    status: Mapped[str] = mapped_column(String, default="pending")
    
    # Relationships
    detections: Mapped[List["Detection"]] = relationship(back_populates="report", cascade="all, delete-orphan")
    location: Mapped[Optional["DamageLocation"]] = relationship(back_populates="report", uselist=False, cascade="all, delete-orphan")
    assessment: Mapped[Optional["Assessment"]] = relationship(back_populates="report", uselist=False, cascade="all, delete-orphan")


class Detection(Base):
    __tablename__ = "detections"
    
    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), nullable=False)
    
    class_name: Mapped[str] = mapped_column(String, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    bbox_xmin: Mapped[float] = mapped_column(Float, nullable=False)
    bbox_ymin: Mapped[float] = mapped_column(Float, nullable=False)
    bbox_xmax: Mapped[float] = mapped_column(Float, nullable=False)
    bbox_ymax: Mapped[float] = mapped_column(Float, nullable=False)
    model_version: Mapped[str] = mapped_column(String, nullable=False)
    
    # Relationships
    report: Mapped["Report"] = relationship(back_populates="detections")


class DamageLocation(Base):
    __tablename__ = "damage_locations"
    
    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), nullable=False, unique=True)
    
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    
    # Relationships
    report: Mapped["Report"] = relationship(back_populates="location")


class Assessment(Base):
    __tablename__ = "assessments"
    
    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), nullable=False, unique=True)
    
    priority_score: Mapped[float] = mapped_column(Float, nullable=False)
    priority_category: Mapped[str] = mapped_column(String, nullable=False)
    assessment_mode: Mapped[str] = mapped_column(String, nullable=False)
    policy_version: Mapped[str] = mapped_column(String, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    
    factor_severity: Mapped[float] = mapped_column(Float, nullable=False)
    factor_traffic_exposure: Mapped[float] = mapped_column(Float, nullable=False)
    factor_road_importance: Mapped[float] = mapped_column(Float, nullable=False)
    factor_critical_facility: Mapped[float] = mapped_column(Float, nullable=False)
    factor_urgency: Mapped[float] = mapped_column(Float, nullable=False)
    
    # SQLite doesn't natively support arrays easily, using JSON for list of strings
    uncertainty_flags: Mapped[list[str]] = mapped_column(JSON, default=list)
    
    # Relationships
    report: Mapped["Report"] = relationship(back_populates="assessment")


class PlanRun(Base):
    __tablename__ = "plan_runs"
    
    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    status: Mapped[str] = mapped_column(String, default="running")
    parameters: Mapped[dict] = mapped_column(JSON, default=dict)
    results: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
