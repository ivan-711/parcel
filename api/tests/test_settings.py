import pytest
from pydantic import SecretStr, ValidationError

from parcel.settings import Settings


def test_production_refuses_the_development_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(environment="production", _env_file=None)  # type: ignore[call-arg]
    real = Settings(environment="production", secret_key=SecretStr("x" * 48), _env_file=None)  # type: ignore[call-arg]
    assert real.is_production
