"""
backend/core/config.py
----------------------
Application-wide configuration loaded from environment variables.

Environment variables (all optional – defaults allow running without credentials):
  ANTHROPIC_API_KEY      – Anthropic API key; if absent, AI assessment is disabled.
  ANTHROPIC_MODEL        – Model ID; default "claude-3-5-haiku-20241022".
  AI_ASSESSMENT_TIMEOUT  – HTTP timeout in seconds for Anthropic calls; default 30.
  AI_ASSESSMENT_ENABLED  – Set to "false" to disable AI assessment even if a key is present.
  DATABASE_URL           – SQLAlchemy connection string for Member 1's repository.
  POLICY_VERSION         – Scoring policy version string; default "1.0.0".
"""

from __future__ import annotations

import os


class Settings:
    """Central settings object.  Constructed once and imported as a singleton."""

    # ---------------------------------------------------------------------------
    # Anthropic / AI assessment
    # ---------------------------------------------------------------------------
    ANTHROPIC_API_KEY: str | None = os.getenv("ANTHROPIC_API_KEY")
    ANTHROPIC_MODEL: str = os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-20241022")
    AI_ASSESSMENT_TIMEOUT: float = float(os.getenv("AI_ASSESSMENT_TIMEOUT", "30"))
    AI_ASSESSMENT_ENABLED: bool = (
        os.getenv("AI_ASSESSMENT_ENABLED", "true").lower() not in {"false", "0", "no"}
    )

    # ---------------------------------------------------------------------------
    # Database
    # ---------------------------------------------------------------------------
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "sqlite+aiosqlite:///./roadsense.db"
    )

    # ---------------------------------------------------------------------------
    # Scoring policy
    # ---------------------------------------------------------------------------
    POLICY_VERSION: str = os.getenv("POLICY_VERSION", "1.0.0")

    @property
    def ai_enabled(self) -> bool:
        """Returns True only when the key is present and the flag is enabled."""
        return bool(self.ANTHROPIC_API_KEY) and self.AI_ASSESSMENT_ENABLED


settings = Settings()
