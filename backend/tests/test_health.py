from contextlib import contextmanager

from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy.sql.elements import TextClause

from app.api.health import get_session_factory
from app.core.config import Settings
from app.db.health import check_database
from app.main import create_app


class RecordingSession:
    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.statements: list[str] = []

    def execute(self, statement: TextClause) -> None:
        self.statements.append(str(statement))
        if self.error is not None:
            raise self.error


def settings() -> Settings:
    return Settings(
        APP_ENV="test",
        DATABASE_URL=SecretStr("postgresql+psycopg://user:secret@localhost/test"),
        CORS_ORIGINS=("http://localhost:5173",),
        _env_file=None,
    )


def factory_for(session: RecordingSession):
    @contextmanager
    def factory():
        yield session

    return factory


def test_check_database_executes_select_one() -> None:
    session = RecordingSession()

    result = check_database(factory_for(session))

    assert result.status == "healthy"
    assert session.statements == ["SELECT 1"]


def test_health_endpoint_returns_exact_healthy_schema() -> None:
    app = create_app(settings())
    app.dependency_overrides[get_session_factory] = lambda: factory_for(
        RecordingSession()
    )

    response = TestClient(app).get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy",
        "api": "healthy",
        "database": "healthy",
        "version": "0.1.0",
    }


def test_database_failure_returns_sanitized_503() -> None:
    app = create_app(settings())
    secret_error = RuntimeError("password=do-not-print host=internal")
    app.dependency_overrides[get_session_factory] = lambda: factory_for(
        RecordingSession(secret_error)
    )

    response = TestClient(app, raise_server_exceptions=False).get("/api/v1/health")

    assert response.status_code == 503
    assert response.json() == {
        "status": "degraded",
        "api": "healthy",
        "database": "unavailable",
        "version": "0.1.0",
    }
    assert "do-not-print" not in response.text
    assert "internal" not in response.text


def test_cors_uses_only_configured_origins() -> None:
    app = create_app(settings())
    app.dependency_overrides[get_session_factory] = lambda: factory_for(
        RecordingSession()
    )
    client = TestClient(app)

    allowed = client.get("/api/v1/health", headers={"Origin": "http://localhost:5173"})
    rejected = client.get(
        "/api/v1/health", headers={"Origin": "https://untrusted.example"}
    )

    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-origin" not in rejected.headers


def test_application_construction_does_not_open_database_connection() -> None:
    app = create_app(settings())

    assert app.title == "PokéVault API"
