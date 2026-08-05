import re
import sqlite3
from pathlib import Path

from src.legal_fts.types import LegalSearchHit


class LegalFTSSearcher:
    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)

    def is_ready(self) -> bool:
        return self.db_path.is_file()

    def count(self) -> int:
        if not self.is_ready():
            return 0
        with sqlite3.connect(self.db_path) as connection:
            return int(connection.execute("SELECT COUNT(*) FROM legal_docs").fetchone()[0])

    @staticmethod
    def _fts_query(query: str) -> str:
        words = re.findall(r"[A-Za-zА-Яа-яЁё0-9]{2,}", query)
        return " OR ".join(f'"{word}"' for word in words[:12])

    def search(self, query: str, top_k: int = 5) -> list[LegalSearchHit]:
        if not self.is_ready():
            return []
        fts_query = self._fts_query(query)
        if not fts_query:
            return []
        sql = """
            SELECT d.title, d.path,
                   snippet(legal_docs_fts, 1, '<mark>', '</mark>', ' … ', 28) AS excerpt,
                   bm25(legal_docs_fts) AS rank
            FROM legal_docs_fts
            JOIN legal_docs d ON d.id = legal_docs_fts.rowid
            WHERE legal_docs_fts MATCH ?
            ORDER BY rank
            LIMIT ?
        """
        with sqlite3.connect(self.db_path) as connection:
            rows = connection.execute(sql, (fts_query, max(1, min(top_k, 20)))).fetchall()
        return [
            LegalSearchHit(
                title=row[0],
                path=row[1],
                text=row[2],
                score=round(1.0 / (1.0 + abs(float(row[3]))), 4),
            )
            for row in rows
        ]
