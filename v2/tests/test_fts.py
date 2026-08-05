from pathlib import Path

from src.legal_fts.indexer import LegalFTSIndexer
from src.legal_fts.searcher import LegalFTSSearcher


def test_fts_finds_supply_risk(tmp_path: Path) -> None:
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    (corpus / "supply.md").write_text(
        "# Поставка\nСрок поставки и порядок приёмки товара фиксируются в договоре.",
        encoding="utf-8",
    )
    db_path = tmp_path / "index.sqlite3"
    assert LegalFTSIndexer(db_path).build(corpus) == 1
    hits = LegalFTSSearcher(db_path).search("срок поставки")
    assert hits
    assert hits[0].title == "Поставка"
    assert "поставки" in hits[0].text.lower()


def test_fts_returns_empty_for_blank_query(tmp_path: Path) -> None:
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    (corpus / "one.md").write_text("# Тест\nДоговор", encoding="utf-8")
    db_path = tmp_path / "index.sqlite3"
    LegalFTSIndexer(db_path).build(corpus)
    assert LegalFTSSearcher(db_path).search(" ") == []
