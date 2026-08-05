import base64
from pathlib import Path

import httpx

from src.indexer.ocr.base import OCREngine, OCRResult

OCR_PROMPT = """Распознай весь видимый текст юридического или бухгалтерского документа.

Требования:
- верни только распознанный текст в Markdown;
- сохрани заголовки, номера, даты, суммы, реквизиты и подписи;
- таблицы представь строками с разделителем |;
- не додумывай нечитаемые фрагменты, используй пометку [неразборчиво];
- обязательно проверь нижнюю часть страницы.
"""


class QwenVLOCR(OCREngine):
    """Local image OCR powered by Qwen3-VL through Ollama."""

    name = "qwen_vl"

    def __init__(
        self,
        host: str = "http://127.0.0.1:11434",
        model: str = "qwen3-vl:4b",
        *,
        timeout_seconds: float = 900.0,
        attempts: int = 2,
        client: httpx.Client | None = None,
    ) -> None:
        self.host = host.rstrip("/")
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.attempts = max(1, attempts)
        self._client = client

    def _request(self, image_path: Path, prompt: str) -> str:
        image = base64.b64encode(image_path.read_bytes()).decode("ascii")
        payload = {
            "model": self.model,
            "prompt": prompt,
            "images": [image],
            "stream": False,
            "options": {"temperature": 0.0, "num_ctx": 8192},
        }
        owns_client = self._client is None
        client = self._client or httpx.Client(timeout=self.timeout_seconds)
        try:
            response = client.post(f"{self.host}/api/generate", json=payload)
            response.raise_for_status()
            body = response.json()
            if body.get("error"):
                raise RuntimeError(f"Ollama error: {body['error']}")
            return str(body.get("response", "")).strip()
        finally:
            if owns_client:
                client.close()

    @staticmethod
    def _quality(text: str) -> int:
        if not text:
            return -10_000
        score = min(len(text), 4000)
        upper = text.upper()
        score += 150 * sum(
            marker in upper
            for marker in ("ДОГОВОР", "АКТ", "ИНН", "ИТОГО", "ЗАКАЗЧИК", "ПОСТАВЩИК")
        )
        return score

    def extract(self, image_path: Path) -> OCRResult:
        image_path = Path(image_path)
        if not image_path.is_file():
            raise FileNotFoundError(image_path)
        best = ""
        best_score = -10_000
        for attempt in range(self.attempts):
            prompt = OCR_PROMPT
            if attempt:
                prompt += "\nПовтори проверку и не пропускай таблицы, реквизиты и нижний блок подписей."
            text = self._request(image_path, prompt)
            score = self._quality(text)
            if score > best_score:
                best = text
                best_score = score
            if len(text) >= 650:
                break
        return OCRResult(text=best, engine=self.name, confidence=0.85 if best else 0.0)

    def is_available(self) -> bool:
        owns_client = self._client is None
        client = self._client or httpx.Client(timeout=5.0)
        try:
            response = client.get(f"{self.host}/api/tags")
            response.raise_for_status()
            names = {str(item.get("name", "")) for item in response.json().get("models", [])}
            return self.model in names or any(name.startswith(self.model.split(":")[0]) for name in names)
        except httpx.HTTPError:
            return False
        finally:
            if owns_client:
                client.close()
