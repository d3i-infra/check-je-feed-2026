"""Every participant-facing Dutch string in the port package is informal (je/jouw):
the study's participants are sixteen. Mirrors packages/mobile-tiktok/src/text.test.ts."""
import re
from pathlib import Path

PORT = Path(__file__).resolve().parents[1] / "port"
SOURCES = [PORT / "helpers" / "port_helpers.py", PORT / "helpers" / "flow_builder.py", PORT / "main.py"]
NL_LINE = re.compile(r'"nl":\s*f?"(?P<text>[^"]*)"')
FORMAL = re.compile(r"\b(u|uw|alstublieft)\b", re.IGNORECASE)


def test_no_formal_dutch_in_participant_copy():
    offenders = []
    for src in SOURCES:
        for n, line in enumerate(src.read_text().splitlines(), 1):
            m = NL_LINE.search(line)
            if m and FORMAL.search(m.group("text")):
                offenders.append(f"{src.name}:{n}: {m.group('text')[:60]}")
    assert offenders == []
