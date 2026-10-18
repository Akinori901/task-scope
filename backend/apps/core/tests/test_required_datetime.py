from datetime import UTC, datetime

import pytest

from apps.core.services import jira_sync_service, sync_service


@pytest.mark.parametrize("module", [sync_service, jira_sync_service])
def test_parses_iso_datetime(module) -> None:  # type: ignore[no-untyped-def]
    got = module._parse_required_datetime("2024-01-15T10:30:00Z", "created")
    assert got == datetime(2024, 1, 15, 10, 30, tzinfo=UTC)


@pytest.mark.parametrize("module", [sync_service, jira_sync_service])
@pytest.mark.parametrize("value", [None, ""])
def test_missing_value_names_the_field(module, value) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(ValueError, match="updated"):
        module._parse_required_datetime(value, "updated")
