from typing import Any

import pytest
from pydantic import SecretStr, ValidationError

from parcel.settings import Settings

PRODUCTION: dict[str, Any] = {
    "environment": "production",
    "secret_key": SecretStr("k" * 48),
    "database_url": "postgresql://u:p@db.internal:5432/parcel",
    "clerk_issuer": "https://clerk.parceldesk.io",
    "clerk_webhook_secret": SecretStr("whsec_live"),
}


@pytest.fixture(autouse=True)
def bare_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in Settings.model_fields:
        monkeypatch.delenv(name.upper(), raising=False)


def make(**values: Any) -> Settings:
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


def test_a_complete_production_config_starts() -> None:
    assert make(**PRODUCTION).is_production


def test_production_is_the_default_and_refuses_an_empty_config() -> None:
    with pytest.raises(ValidationError) as e:
        make()
    message = str(e.value)
    for name in ("SECRET_KEY", "DATABASE_URL"):
        assert name in message
    assert "ENVIRONMENT=development" in message


@pytest.mark.parametrize("secret", ["dev-only-secret-change-me-in-every-real-environment", "short"])
def test_production_refuses_a_weak_secret(secret: str) -> None:
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        make(**{**PRODUCTION, "secret_key": SecretStr(secret)})


def test_the_environment_variable_turns_the_checks_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "development")
    assert not make().is_production
    monkeypatch.setenv("ENVIRONMENT", "production")
    with pytest.raises(ValidationError):
        make()


def test_accounts_are_optional_but_clerk_needs_its_webhook_secret_once_set() -> None:
    demo_only = {k: v for k, v in PRODUCTION.items() if not k.startswith("clerk")}
    assert make(**demo_only).clerk_issuer == ""
    with pytest.raises(ValidationError, match="CLERK_WEBHOOK_SECRET"):
        make(**demo_only, clerk_issuer="https://clerk.parceldesk.io")
    with pytest.raises(ValidationError, match="CLERK_ISSUER"):
        make(**{**PRODUCTION, "clerk_issuer": "clerk.parceldesk.io"})


def test_stripe_needs_its_webhook_secret_once_it_has_a_key() -> None:
    with pytest.raises(ValidationError, match="STRIPE_WEBHOOK_SECRET"):
        make(**PRODUCTION, stripe_secret_key=SecretStr("sk_test_1"))


@pytest.mark.parametrize("scheme", ["postgres://", "postgresql://", "postgresql+asyncpg://"])
def test_database_urls_from_hosts_get_the_async_driver(scheme: str) -> None:
    settings = make(environment="test", database_url=f"{scheme}u:p@db:5432/parcel")
    assert settings.database_url == "postgresql+asyncpg://u:p@db:5432/parcel"


def test_a_bare_environment_means_live_providers_and_the_local_web_app() -> None:
    settings = make(environment="test")
    assert settings.providers == "live"
    assert settings.web_origins == ["http://localhost:5173"]
    assert settings.stripe_webhook_secret.get_secret_value() == ""
