from datetime import date

import pytest

from ktown_defense.sync_expeditions import build_parser


def test_cli_defaults_to_busan_and_bounded_window() -> None:
    args = build_parser().parse_args([])

    assert args.area_code == "6"
    assert args.limit == 100
    assert args.days == 30
    assert args.keyword is None


def test_cli_accepts_repeated_keywords_and_start_date() -> None:
    args = build_parser().parse_args(
        ["--keyword", "BTS", "--keyword", "K-POP", "--start-date", "2026-08-22"]
    )

    assert args.keyword == ["BTS", "K-POP"]
    assert args.start_date == date(2026, 8, 22)


@pytest.mark.parametrize("arguments", [["--limit", "0"], ["--limit", "101"], ["--days", "0"], ["--days", "91"], ["--start-date", "2026-02-30"]])
def test_cli_rejects_unsafe_ranges_and_invalid_dates(arguments: list[str]) -> None:
    with pytest.raises(SystemExit):
        build_parser().parse_args(arguments)
