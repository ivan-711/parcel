from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_SECRET = "dev-only-secret-change-me-in-every-real-environment"
DEV_DATABASE = "postgresql+asyncpg://parcel:parcel@localhost:5433/parcel"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["production", "development", "test"] = "production"
    """Production unless told otherwise, so a deploy that forgets to say gets the strict checks."""
    database_url: str = DEV_DATABASE
    web_origins: list[str] = ["http://localhost:5173"]
    secret_key: SecretStr = SecretStr(DEV_SECRET)
    """Signs demo session tokens. Must be set to a long random value outside development."""

    clerk_issuer: str = ""
    """Your Clerk frontend API URL, e.g. https://clerk.parceldesk.io.

    Empty means accounts are off and only demo sessions can sign in.
    """
    clerk_webhook_secret: SecretStr = SecretStr("")

    rentcast_api_key: SecretStr = SecretStr("")
    rentcast_monthly_budget: int = 45
    lookups_per_user_per_day: int = 5
    autocompletes_per_user_per_day: int = 300
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

    @field_validator("database_url")
    @classmethod
    def _async_driver(cls, url: str) -> str:
        """Hosts hand out postgres:// URLs. SQLAlchemy needs to be told to use asyncpg."""
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+asyncpg://" + url.removeprefix(prefix)
        return url

    @model_validator(mode="after")
    def _complete_in_production(self) -> Self:
        if not self.is_production:
            return self
        secret = self.secret_key.get_secret_value()
        missing = []
        if secret == DEV_SECRET or len(secret) < 32:
            missing.append("SECRET_KEY (a random value of 32+ characters)")
        if self.database_url == DEV_DATABASE:
            missing.append("DATABASE_URL")
        if self.clerk_issuer and not self.clerk_issuer.startswith("https://"):
            missing.append("CLERK_ISSUER (an https URL)")
        if self.clerk_issuer and not self.clerk_webhook_secret.get_secret_value():
            missing.append("CLERK_WEBHOOK_SECRET")
        if self.stripe_secret_key.get_secret_value() and not (
            self.stripe_webhook_secret.get_secret_value() and self.stripe_pro_price_id
        ):
            missing.append("STRIPE_WEBHOOK_SECRET and STRIPE_PRO_PRICE_ID")
        if missing:
            raise ValueError(
                "Production needs " + ", ".join(missing) + ". "
                "Set ENVIRONMENT=development to run locally."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
