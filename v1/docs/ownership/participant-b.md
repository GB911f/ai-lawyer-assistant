# v1 / Participant B — Documents & Product

Зоны ответственности:

1. App shell, дизайн-система и навигация.
2. Парсеры загрузок и OCR-интерфейс.
3. Синтетические схемы и шаблоны.
4. Генерация DOCX/PDF и batch generation.
5. Конструктор и архив документов.
6. Golden-file, parser и E2E-тесты, демоданные.

Файловые зоны: `frontend/`, `src/docgen/`, `src/document_analyzer/`, `src/indexer/`, продуктовые
роутеры `src/api/routers/documents.py` и `templates.py`, документные демоданные и шаблоны,
`scripts/generate_demo_assets.py`, `tests/test_docgen.py`, `tests/test_parsers.py` и `tests/golden/`.

Демонстрационные организации, реквизиты, документы и изображения вымышлены. Бинарные шаблоны
создаются из кода и не происходят из материалов исходного заказчика.

Специфика v1: OCR изображений и PDF-сканов выполняет локальная `qwen3-vl:4b` через Ollama.

## Порядок загрузки

Распакуйте архив v1/Participant B в корень общего репозитория после архива v1/Participant A. Все
файлы уже находятся внутри директории `v1/`; пути двух архивов не пересекаются.

## Вариант истории участника

Логичные отдельные задачи/коммиты: `app shell and design system`, `upload parsers and OCR contract`,
`synthetic schemas`, `DOCX/PDF and batch generation`, `document constructor and archive`,
`golden and E2E tests with demo data`. Фактический автор должен проверить код и самостоятельно
зафиксировать только выполненную им работу.
