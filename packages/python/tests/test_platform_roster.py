"""check-je-feed ships one study platform. The example and e2etest modules are
test infrastructure (ADR-0004 excludes the e2etest pair from release; example
is the non-normative template that e2etest delegates to)."""
from pathlib import Path

PLATFORMS = Path(__file__).resolve().parents[1] / "port" / "platforms"
CONFIGS = Path(__file__).resolve().parents[1] / "port" / "configs"

EXPECTED_MODULES = {"tiktok.py", "example.py", "e2etest.py", "e2etest_multifile.py"}
EXPECTED_CONFIGS = {
    "tiktok_config.json", "example_config.json",
    "e2etest_config.json", "e2etest_multifile_config.json",
}


def test_only_tiktok_and_test_platforms_remain():
    assert {p.name for p in PLATFORMS.glob("*.py")} == EXPECTED_MODULES


def test_only_tiktok_and_test_configs_remain():
    assert {p.name for p in CONFIGS.glob("*_config.json")} == EXPECTED_CONFIGS


import json

from port.platforms.tiktok import EXTRACTOR_REGISTRY

KEPT_TABLES = [
    "tiktok_activity_summary", "tiktok_watch_history", "tiktok_favorite_videos",
    "tiktok_follower", "tiktok_following", "tiktok_like_list", "tiktok_comments",
]
KEPT_EXTRACTORS = [
    "activity_summary_to_df", "watch_history_to_df", "favorite_videos_to_df",
    "follower_to_df", "following_to_df", "like_list_to_df", "comments_to_df",
]


def test_tiktok_config_lists_the_seven_study_tables_in_order():
    cfg = json.loads((CONFIGS / "tiktok_config.json").read_text())
    assert [t["id"] for t in cfg["tables"]] == KEPT_TABLES
    assert [t["extractor"] for t in cfg["tables"]] == KEPT_EXTRACTORS


def test_tiktok_registry_matches_the_config():
    assert list(EXTRACTOR_REGISTRY) == KEPT_EXTRACTORS


def test_comments_table_carries_the_post_link():
    cfg = json.loads((CONFIGS / "tiktok_config.json").read_text())
    comments = [t for t in cfg["tables"] if t["id"] == "tiktok_comments"][0]
    assert "Url" in comments["headers"]


def test_watch_history_carries_the_over_time_visualization():
    cfg = json.loads((CONFIGS / "tiktok_config.json").read_text())
    wh = [t for t in cfg["tables"] if t["id"] == "tiktok_watch_history"][0]
    viz = wh["visualizations"]
    assert len(viz) == 1
    assert viz[0]["type"] == "area"
    assert viz[0]["group"]["column"] == "Date"
    assert viz[0]["group"]["dateFormat"] == "auto"
    assert viz[0]["values"][0]["addZeroes"] is True
    for node in (viz[0]["title"], viz[0]["group"]["label"], viz[0]["values"][0]["label"]):
        assert set(node) >= {"en", "nl"} and node["en"] and node["nl"]
