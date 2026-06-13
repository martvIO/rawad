"""Local-only FastAPI control dashboard for the Dawa load test.

This package drives the existing Locust suite (loadtest/locustfile.py via a
subprocess), streams live metrics to the browser over SSE, always runs full
LOADTEST-data cleanup after a run, and manages an archived run history.

It is a developer tool bound to 127.0.0.1 and is never deployed. It must NOT
import locustfile.py / locust / gevent (they monkey-patch the event loop) — the
load test only ever runs as a child process.
"""

__all__ = ["api", "runner", "cleanup", "history", "configstore", "schemas"]
