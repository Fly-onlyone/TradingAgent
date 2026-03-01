"""Tests for Sentry-related application settings."""

import pytest
from app.config import Settings


def test_sentry_settings_defaults() -> None:
    settings = Settings(_env_file=None, debug=True, secret_key="test-secret")

    assert settings.sentry_environment == ""
    assert settings.sentry_release == ""
    assert settings.sentry_traces_sample_rate == 0.1
    assert settings.sentry_profiles_sample_rate == 0.1


def test_sentry_traces_sample_rate_must_be_between_zero_and_one() -> None:
    with pytest.raises(ValueError, match="sentry_traces_sample_rate"):
        Settings(
            debug=True,
            secret_key="test-secret",
            sentry_traces_sample_rate=1.1,
        )


def test_sentry_profiles_sample_rate_must_be_between_zero_and_one() -> None:
    with pytest.raises(ValueError, match="sentry_profiles_sample_rate"):
        Settings(
            debug=True,
            secret_key="test-secret",
            sentry_profiles_sample_rate=-0.1,
        )
