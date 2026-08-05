from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class OCRResult:
    text: str
    engine: str
    confidence: float | None = None


class OCREngine(ABC):
    name: str

    @abstractmethod
    def extract(self, image_path: Path) -> OCRResult:
        raise NotImplementedError
