from src.core.config import get_settings
from src.legal_fts.indexer import LegalFTSIndexer


def main() -> None:
    settings = get_settings()
    count = LegalFTSIndexer(settings.legal_fts_db_path).build(settings.legal_corpus_dir)
    print(f"Indexed {count} synthetic legal documents into {settings.legal_fts_db_path}")


if __name__ == "__main__":
    main()
