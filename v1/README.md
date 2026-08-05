# Jarvis Legal Agent — v1 / Local

## Архитектура v1

- Qwen3 14B через локальный Ollama API для чата и юридического анализа;
- Qwen3-VL 4B для OCR изображений и страниц PDF без текстового слоя;
- обычные парсеры для TXT, Markdown, DOCX и текстовых PDF;
- SQLite FTS5 для синтетического правового корпуса;
- безопасный allow-list инструментов без shell-доступа;
- PostgreSQL/SQLite, серверные сессии и Alembic;
- SSE-стриминг, цитирование и переключатели источников;
- DOCX/PDF, пакетная генерация, конструктор и архив документов.

## Подготовка Ollama

```bash
ollama serve
ollama pull qwen3:14b
ollama pull qwen3-vl:4b
```

Для `pdf2image` необходим Poppler. На macOS:

```bash
brew install poppler
```

## Запуск

```bash
cp .env.example .env
uv sync --dev
uv run python scripts/build_demo_index.py
uv run uvicorn src.api.main:app --reload
```

Во втором терминале:

```bash
cd frontend
npm ci
npm run dev
```

Откройте `http://127.0.0.1:5173`. Демо-вход: `demo` / `demo`.

Для интерфейсной демоверсии без backend и Ollama:

```bash
cd frontend
npm run demo
```

## Обработка файлов

- TXT/MD читаются напрямую;
- DOCX разбирается через `python-docx`;
- PDF сначала проверяется на текстовый слой через `pypdf`;
- страницы PDF без текста рендерятся в PNG и передаются `qwen3-vl:4b`;
- JPG/PNG передаются `qwen3-vl:4b` напрямую.

После извлечения текст разбивается на фрагменты и используется агентом вместе с найденными
правовыми источниками.

## PostgreSQL

```bash
docker compose up -d postgres
```

Затем укажите в `.env`:

```env
DATABASE_URL=postgresql+asyncpg://jarvis:change-me@127.0.0.1:5432/jarvis
```

## Ограничения

- Корпус и документы в `data/demo` полностью синтетические.
- В поставку не входит база КонсультантПлюс.
- Модели могут ошибаться; ответы и созданные документы требуют проверки юристом.
- Ollama слушает только локальный адрес и не должен публиковаться без сетевой защиты.
