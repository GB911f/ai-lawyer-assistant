from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ParsedDocument:
    path: Path
    text: str
    parser: str
    used_ocr: bool = False
