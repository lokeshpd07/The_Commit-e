from backend.db.session import SessionLocal
from backend.db.repositories import AssessmentRepositoryImpl

assessment_repository = AssessmentRepositoryImpl(SessionLocal)
