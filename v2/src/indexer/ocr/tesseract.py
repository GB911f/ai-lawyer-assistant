from pathlib import Path

from PIL import Image

from src.indexer.ocr.base import OCREngine, OCRResult


class TesseractOCR(OCREngine):
    name = "tesseract"

    def __init__(self, language: str = "rus+eng") -> None:
        self.language = language

    def extract(self, image_path: Path) -> OCRResult:
        import pytesseract

        text = pytesseract.image_to_string(Image.open(image_path), lang=self.language)
        return OCRResult(text=text.strip(), engine=self.name, confidence=None)
