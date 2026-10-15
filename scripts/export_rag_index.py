#!/usr/bin/env python3
"""Export Chroma index to JSON for client-side RAG."""

import json
import sys
from pathlib import Path

CANON_DIR = Path(__file__).parent.parent / "backend" / "canon"
INDEX_DIR = CANON_DIR / "index"
OUTPUT_PATH = Path(__file__).parent.parent / "frontend" / "public" / "rag-index.json"

EMBED_MODEL = "BAAI/bge-base-en-v1.5"
COLLECTION = "canon"


def main():
    sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

    import chromadb
    from chromadb.config import Settings

    if not (INDEX_DIR / "chroma.sqlite3").is_file():
        print(f"Index not found at {INDEX_DIR}. Run: python -m backend.rag")
        sys.exit(1)

    client = chromadb.PersistentClient(
        path=str(INDEX_DIR),
        settings=Settings(anonymized_telemetry=False),
    )

    collection = client.get_collection(COLLECTION)

    count = collection.count()
    print(f"Exporting {count} documents from {INDEX_DIR}...")

    batch_size = 1000
    all_docs = []
    all_metas = []
    all_embeddings = []

    for offset in range(0, count, batch_size):
        limit = min(batch_size, count - offset)
        result = collection.get(
            limit=limit,
            offset=offset,
            include=["documents", "metadatas", "embeddings"],
        )
        all_docs.extend(result["documents"])
        all_metas.extend(result["metadatas"])
        if result.get("embeddings"):
            all_embeddings.extend(result["embeddings"])

    output = {
        "model": EMBED_MODEL,
        "documents": all_docs,
        "metadatas": all_metas,
        "embeddings": all_embeddings,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(output, f)

    size_mb = OUTPUT_PATH.stat().st_size / (1024 * 1024)
    print(f"Wrote {len(all_docs)} passages to {OUTPUT_PATH} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()