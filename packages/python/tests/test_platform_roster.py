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
