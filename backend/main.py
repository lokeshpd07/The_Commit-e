"""
backend/main.py
---------------
RoadSense AI backend application entry point.

This file is owned by Member 2 as a minimal app bootstrap.
Member 1 should extend it with database lifecycle hooks and shared middleware.

Startup order:
1. FastAPI app is created with metadata.
2. Routers from Member 2 (priorities) and future members are included.
3. A /healthz endpoint confirms the service is live.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes.priorities import router as priorities_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(
    title="RoadSense AI",
    description=(
        "Explainable road-damage prioritisation API. "
        "Priority scores are prototype policy outputs — not validated public-safety standards."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(priorities_router)


@app.get("/healthz", tags=["health"])
def healthz() -> dict[str, str]:
    """Liveness probe endpoint."""
    return {"status": "ok"}
