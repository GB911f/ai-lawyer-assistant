from pathlib import Path


def parse_text(path: Path) -> str:
    return Path(path).read_text(encoding="utf-8", errors="replace").strip()
