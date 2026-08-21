import pytest

from ktown_defense.sync_ktour import build_parser


def test_cli_defaults_to_busan_and_one_hundred_places() -> None:
    args = build_parser().parse_args([])

    assert args.area_code == "6"
    assert args.limit == 100


@pytest.mark.parametrize("limit", [0, 101])
def test_cli_rejects_limits_outside_safe_range(limit: int) -> None:
    with pytest.raises(SystemExit):
        build_parser().parse_args(["--limit", str(limit)])
