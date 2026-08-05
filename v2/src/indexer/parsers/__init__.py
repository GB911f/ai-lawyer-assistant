from pathlib import Path

from src.indexer.models import ParsedDocument
from src.indexer.ocr.base import OCREngine
from src.indexer.parsers.docx import parse_docx
from src.indexer.parsers.pdf import parse_pdf
from src.indexer.parsers.text import parse_text

SUPPORTED_EXTENSIONS = {".txt", ".md", ".docx", ".pdf", ".png", ".jpg", ".jpeg"}


def parse_file(path: Path, ocr: OCREngine | None = None) -> ParsedDocument:
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md"}:
        return ParsedDocument(path=path, text=parse_text(path), parser="text")
    if suffix == ".docx":
        return ParsedDocument(path=path, text=parse_docx(path), parser="docx")
    if suffix == ".pdf":
        return ParsedDocument(path=path, text=parse_pdf(path), parser="pypdf")
    if suffix in {".png", ".jpg", ".jpeg"}:
        if ocr is None:
            raise ValueError("OCR engine is required for image files")
        result = ocr.extract(path)
        return ParsedDocument(path=path, text=result.text, parser=result.engine, used_ocr=True)
    raise ValueError(f"Unsupported file extension: {suffix}")
