"""Every participant-facing Dutch string in the port package is informal (je/jouw):
the study's participants are sixteen. Mirrors packages/mobile-tiktok/src/text.test.ts."""
import json
import re
from pathlib import Path

PORT = Path(__file__).resolve().parents[1] / "port"
CONFIGS = PORT / "configs"

NL_LINE = re.compile(r'"nl":\s*f?"((?:[^"\\]|\\.)*)"')
FORMAL = re.compile(r"\b(u|uw|alstublieft)\b", re.IGNORECASE)

# Files that are not this study's participant copy and may stay formal.
ALLOWLIST = {
    # Non-normative template platform; never shipped to a participant.
    PORT / "platforms" / "example.py",
    # Test-only platform excluded from release builds (ADR-0004).
    PORT / "platforms" / "e2etest.py",
    # Test-only platform excluded from release builds (ADR-0004).
    PORT / "platforms" / "e2etest_multifile.py",
    # Non-normative template config; never shipped to a participant.
    CONFIGS / "example_config.json",
    # Test-only config excluded from release builds (ADR-0004).
    CONFIGS / "e2etest_config.json",
    # Test-only config excluded from release builds (ADR-0004).
    CONFIGS / "e2etest_multifile_config.json",
}


def _py_offenders(path: Path) -> list[str]:
    offenders = []
    for n, line in enumerate(path.read_text().splitlines(), 1):
        for m in NL_LINE.finditer(line):
            if FORMAL.search(m.group(1)):
                offenders.append(f"{path.relative_to(PORT)}:{n}: {m.group(1)[:60]}")
    return offenders


def _json_nl_strings(obj) -> list[str]:
    found = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key == "nl" and isinstance(value, str):
                found.append(value)
            else:
                found.extend(_json_nl_strings(value))
    elif isinstance(obj, list):
        for item in obj:
            found.extend(_json_nl_strings(item))
    return found


def _json_offenders(path: Path) -> list[str]:
    offenders = []
    data = json.loads(path.read_text())
    for text in _json_nl_strings(data):
        if FORMAL.search(text):
            offenders.append(f"{path.relative_to(PORT)}: {text[:60]}")
    return offenders


def test_no_formal_dutch_in_participant_copy():
    offenders = []
    scanned = 0
    for src in sorted(PORT.rglob("*.py")):
        if src in ALLOWLIST:
            continue
        scanned += 1
        offenders.extend(_py_offenders(src))
    for src in sorted(CONFIGS.glob("*.json")):
        if src in ALLOWLIST:
            continue
        scanned += 1
        offenders.extend(_json_offenders(src))
    assert scanned > 0
    assert offenders == []
