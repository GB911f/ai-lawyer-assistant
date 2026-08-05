# v2 / Participant A — Research & Platform

Зоны ответственности:

1. Конфигурация, PostgreSQL, auth и миграции.
2. Синтетический правовой корпус и SQLite FTS5.
3. Безопасный LLM-provider и allow-list инструментов.
4. Chat API и SSE-стриминг.
5. Переключатели источников на уровне API и модель цитирования.
6. Retrieval/eval-тесты и CI.

Файловые зоны: корневая конфигурация, `.github/`, `alembic/`, `src/api/` кроме продуктовых
роутеров документов, `src/auth/`, `src/core/`, `src/db/`, `src/legal_fts/`, `src/llm/`, `src/rag/`,
`data/demo/legal_corpus/`, `scripts/build_demo_index.py`, `tests/test_api.py`, `tests/test_fts.py` и
`tests/test_llm.py`.

Все значения конфигурации в публичной версии синтетические. Реальные ключи и базы данных
никогда не должны добавляться в этот репозиторий.

## Порядок загрузки

Распакуйте архив v2/Participant A в корень общего репозитория. Все файлы уже находятся внутри
директории `v2/`. Затем добавьте архив v2/Participant B. Пути архивов не пересекаются.

## Вариант истории участника

Логичные отдельные задачи/коммиты: `project configuration and database`, `auth and migrations`,
`synthetic FTS corpus`, `safe LLM tools`, `chat SSE and citations`, `retrieval tests and CI`.
Фактический автор должен проверить код и самостоятельно зафиксировать только выполненную им работу.
