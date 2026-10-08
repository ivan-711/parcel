from functools import lru_cache
from typing import Self

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "dev-only-secret-change-me-in-every-real-environment"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql+asyncpg://parcel:parcel@localhost:5433/parcel"
    web_origins: list[str] = ["http://localhost:5173"]
    secret_key: SecretStr = SecretStr(DEV_SECRET)
    """Signs demo session tokens. Must be set to a long random value outside development."""

    clerk_issuer: str = ""
    """Your Clerk frontend API URL, e.g. https://clerk.parceldesk.io."""
    clerk_webhook_secret: SecretStr = SecretStr("")

    rentcast_api_key: SecretStr = SecretStr("")
    rentcast_monthly_budget: int = 45
    lookups_per_user_per_day: int = 5
    geoapify_api_key: SecretStr = SecretStr("")
    fred_api_key: SecretStr = SecretStr("")
    hud_api_token: SecretStr = SecretStr("")
    providers: str = "live"
    """'live' calls the real data providers. 'fixtures' answers from recorded responses."""

    anthropic_api_key: SecretStr = SecretStr("")
    memo_model: str = "claude-sonnet-5-5"
    memos_per_day_free: int = 3
    memos_per_day_pro: int = 30
    memo_daily_budget: int = 150
    """Memos written across all users per day, a ceiling on model spend."""

    stripe_secret_key: SecretStr = SecretStr("")
    stripe_webhook_secret: SecretStr = SecretStr("")
    stripe_pro_price_id: str = ""

    demo_ttl_hours: int = 24
    demos_per_ip_per_day: int = 10
    sentry_dsn: str = ""
    log_json: bool = Field(default=False)

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @model_validator(mode="after")
    def _real_secret_in_production(self) -> Self:
        secret = self.secret_key.get_secret_value()
        if self.is_production and (secret == DEV_SECRET or len(secret) < 32):
            raise ValueError("SECRET_KEY must be a random value of 32+ characters in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
