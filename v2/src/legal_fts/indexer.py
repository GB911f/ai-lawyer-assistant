import sqlite3
from pathlib import Path


class LegalFTSIndexer:
    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)

    def build(self, corpus_dir: Path) -> int:
        corpus_dir = Path(corpus_dir)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        files = sorted([*corpus_dir.rglob("*.md"), *corpus_dir.rglob("*.txt")])
        with sqlite3.connect(self.db_path) as connection:
            connection.executescript(
                """
                DROP TABLE IF EXISTS legal_docs_fts;
                DROP TABLE IF EXISTS legal_docs;
                CREATE TABLE legal_docs (
                    id INTEGER PRIMARY KEY,
                    title TEXT NOT NULL,
                    path TEXT NOT NULL UNIQUE,
                    body TEXT NOT NULL
                );
                CREATE VIRTUAL TABLE legal_docs_fts USING fts5(
                    title,
                    body,
                    content='legal_docs',
                    content_rowid='id',
                    tokenize='unicode61'
                );
                """
            )
            for path in files:
                body = path.read_text(encoding="utf-8")
                title = next(
                    (line.removeprefix("#").strip() for line in body.splitlines() if line.startswith("#")),
                    path.stem.replace("_", " ").title(),
                )
                cursor = connection.execute(
                    "INSERT INTO legal_docs(title, path, body) VALUES (?, ?, ?)",
                    (title, str(path), body),
                )
                connection.execute(
                    "INSERT INTO legal_docs_fts(rowid, title, body) VALUES (?, ?, ?)",
                    (cursor.lastrowid, title, body),
                )
            connection.commit()
        return len(files)
