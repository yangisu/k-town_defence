from ktown_defense.territory_application import stronghold_stage, territory_id_for


def test_address_mapping_uses_backend_catalog() -> None:
    assert territory_id_for("부산광역시 사하구 감천동") == "busan"
    assert territory_id_for("경기도 성남시 분당구") == "seongnam"
    assert territory_id_for("해외 주소") is None


def test_stronghold_stage_uses_score_thresholds() -> None:
    assert stronghold_stage(0) == "seed"
    assert stronghold_stage(1000) == "tree"
    assert stronghold_stage(2000) == "landmark"
