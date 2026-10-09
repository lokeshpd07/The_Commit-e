# RoadSense AI Backend

## Member 1 Implementation: Foundation, API & Detection

This implementation sets up the core FastAPI application, SQLAlchemy database models, YOLOv11 image detection, and related report APIs.

### Setup and Running

1. **Install requirements:**
   ```bash
   pip install -r requirements.txt
   pip install -r requirements-backend.txt
   ```

2. **Configure environment:**
   Copy `.env.example` to `.env` and configure `YOLO_WEIGHTS`, `MAX_UPLOAD_SIZE`, and `DATABASE_URL` (using standard `sqlite:///` connection string).

3. **Run the server:**
   ```bash
   uvicorn backend.main:app --reload
   ```

4. **Run tests:**
   ```bash
   pytest backend/tests/
   ```

### API Endpoints
- `GET /api/v1/health` - Health check and DB status
- `POST /api/v1/reports` - Upload image with form data to create a new report, process detection, and create an assessment
- `GET /api/v1/reports` - List reports with pagination
- `GET /api/v1/reports/{report_id}` - Get detailed report view including location and detections

### Repository Interfaces for Members 2 and 3
Member 1 provides synchronous SQLAlchemy repository implementations:
- `backend/db/repositories.py` contains `AssessmentRepositoryImpl` and `ReportRepository`
- Member 2 can import the interface instance from: `from backend.repositories.assessment import assessment_repository`

Note: Database sessions use synchronous mode (`sqlite:///./roadsense.db`) to fulfill the synchronous Protocol methods defined in `backend/core/repository_interface.py`.

### Remaining Integration Tasks
- Member 2 should ensure their models match the schema validation provided in `AssessmentRecord`.
- Member 3 can utilize the `PlanRun` SQLAlchemy model in `backend/models/domain.py`.
