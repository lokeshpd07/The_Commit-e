## Application architecture
- Keep the public workspace at `/` with read-only sample records; authenticated residents create owned reports and backend role policies restrict all maintenance updates to administrators.
- Store report priority as a generated database value derived from severity and criticality, and order equal priorities oldest-first to make triage deterministic.
- Load Leaflet only after hydration in the map component so the public dashboard remains SSR-safe.
- Keep visual roles in global semantic design tokens, isolate decorative road-network motion in OperationsBackdrop, and wrap the workspace in MotionConfig with reducedMotion="user" so dashboard and dialog movement respects accessibility preferences.
