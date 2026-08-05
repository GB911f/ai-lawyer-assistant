from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory

from pdf2image import convert_from_path
from pypdf import PdfReader

from src.indexer.ocr.base import OCREngine


@dataclass(frozen=True)
class PDFParseResult:
    text: str
    used_ocr: bool
    ocr_engine: str | None


def parse_pdf(path: Path, ocr: OCREngine | None = None, *, dpi: int = 160) -> PDFParseResult:
    reader = PdfReader(str(path))
    chunks: list[str] = []
    used_ocr = False
    for page_number, page in enumerate(reader.pages, 1):
        text = (page.extract_text() or "").strip()
        if not text and ocr is not None:
            with TemporaryDirectory(prefix="jarvis_pdf_ocr_") as directory:
                images = convert_from_path(
                    str(path),
                    dpi=dpi,
                    first_page=page_number,
                    last_page=page_number,
                    fmt="png",
                    output_folder=directory,
                )
                if images:
                    image_path = Path(directory) / f"page-{page_number}.png"
                    images[0].save(image_path, "PNG")
                    text = ocr.extract(image_path).text.strip()
                    used_ocr = bool(text) or used_ocr
        if text:
            chunks.append(f"[стр. {page_number}]\n{text}")
    return PDFParseResult(
        text="\n\n".join(chunks).strip(),
        used_ocr=used_ocr,
        ocr_engine=ocr.name if used_ocr and ocr is not None else None,
    )
