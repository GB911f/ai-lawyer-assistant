from pathlib import Path

from pypdf import PdfReader


def parse_pdf(path: Path) -> str:
    reader = PdfReader(str(path))
    return "\n\n".join((page.extract_text() or "").strip() for page in reader.pages).strip()
