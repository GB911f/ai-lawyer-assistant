# Jarvis Legal Agent — v2 / Claude

## Возможности

- локальный правовой корпус и SQLite FTS5;
- безопасный allow-list инструментов агента без shell-доступа;
- SSE-чат с переключателями локального корпуса и веб-источников;
- загрузка и OCR документов;
- генерация DOCX/PDF и пакетная замена в DOCX;
- конструктор и архив документов;
- PostgreSQL/SQLite, серверные сессии и миграции;
- mock-режим, не требующий внешних API.

Версия v2 использует Claude через официальный Anthropic API. Для автономной интерфейсной демонстрации
по умолчанию доступен безопасный mock-provider.

## Быстрый запуск

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

Для полностью автономного интерфейса без backend:

```bash
cd frontend
npm run demo
```

## PostgreSQL

```bash
docker compose up -d postgres
```

После этого установите в `.env`:

```env
DATABASE_URL=postgresql+asyncpg://jarvis:change-me@127.0.0.1:5432/jarvis
```

## Авторы публичной реконструкции

- Participant A — Research & Platform.
- Participant B — Documents & Product.

Точная карта владения файлами находится в `docs/ownership/`.

## Важные ограничения

- Тексты в `data/demo` являются синтетическими учебными материалами.
- Приложение не поставляется с базой КонсультантПлюс и не связано с её правообладателем.
- Результаты AI являются черновиками и требуют проверки квалифицированным юристом.
- OAuth-токены пользовательских подписок не поддерживаются; внешний провайдер подключается только официальным API-ключом.
