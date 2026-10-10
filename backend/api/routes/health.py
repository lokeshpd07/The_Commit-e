from fastapi import APIRouter
from backend.db.session import engine

router = APIRouter(prefix="/health", tags=["health"])

@router.get("")
def health_check():
    # Check DB connection
    db_status = "ok"
    try:
        with engine.connect() as conn:
            pass
    except Exception as e:
        db_status = "error"
        
    return {
        "status": "ok",
        "database": db_status
    }
