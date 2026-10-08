#!/usr/bin/env python3
"""Index canon text locally and retrieve Dragon Ball Z passages.

LangChain splits, embeds, and stores the chunks. Generation stays in model.complete.
The embedding model is created only when the index is built or searched.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import NamedTuple


CANON_DIR = Path(__file__).parent / "canon"
INDEX_DIR = CANON_DIR / "index"
EMBED_MODEL = "BAAI/bge-base-en-v1.5"
RERANK_MODEL = "BAAI/bge-reranker-base"
# bge queries are prefixed; passages are not. See the bge model card.
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "
COLLECTION = "canon"
CANDIDATES = 40
TOP_K = 5
# bge-reranker-base scores are between 0 and 1. 0.2 keeps a real Super Buu
# passage (about 0.27) and drops the Kid Buu Spirit Bomb passage (about 0.14).
MIN_RERANK_SCORE = 0.2
CHUNK_SIZE = 400
CHUNK_OVERLAP = 100
_HEADING_MAX = 80


class IndexMissing(RuntimeError):
    def __init__(self):
        super().__init__("Canon index is missing. Run: python -m rag")


class Passage(NamedTuple):
    source: str
    title: str
    text: str


def _load_env_file():
    path = Path(__file__).parent / ".env"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file()
os.environ.setdefault("ANONYMIZED_TELEMETRY", "FALSE")


def series_for(path: Path, canon_dir: Path) -> str | None:
    """Tag by folder. canon/z/ is Z, canon/super/ is Super, canon/characters/ is mixed."""
    try:
        parts = path.resolve().relative_to(canon_dir.resolve()).parts
    except ValueError:
        parts = path.parts
    if "z" in parts:
        return "z"
    if "super" in parts:
        return "super"
    if "characters" in parts:
        return "mixed"
    return None


def _is_url(line: str) -> bool:
    stripped = line.strip()
    return stripped.startswith("http://") or stripped.startswith("https://")


def _is_heading(paragraph: str) -> bool:
    """A short single line that is not a sentence, such as 'Plot' or 'The End of Earth'."""
    if "\n" in paragraph:
        return False
    line = paragraph.strip()
    if not line or len(line) >= _HEADING_MAX:
        return False
    return line[-1] not in '.!?"'


def _sections(text: str) -> tuple[str, list[tuple[str, str]]]:
    """Title plus (section, body) pairs. URL lines are dropped, headings are labels."""
    lines = [line for line in text.splitlines() if not _is_url(line)]
    if not lines:
        return "", []
    title = lines[0].strip()
    paragraphs = [part.strip() for part in "\n".join(lines[1:]).split("\n\n") if part.strip()]
    sections: list[tuple[str, str]] = []
    section = ""
    current: list[str] = []
    for paragraph in paragraphs:
        if _is_heading(paragraph):
            if current:
                sections.append((section, "\n\n".join(current)))
            section = paragraph
            current = []
            continue
        current.append(paragraph)
    if current:
        sections.append((section, "\n\n".join(current)))
    return title, sections


def _splitter():
    from langchain_text_splitters import RecursiveCharacterTextSplitter

    return RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", " "],
    )


def load_documents(canon_dir: Path):
    from langchain_core.documents import Document

    documents = []
    for path in sorted(canon_dir.rglob("*.txt")):
        text = path.read_text(encoding="utf-8").strip()
        if not text:
            continue
        series = series_for(path, canon_dir)
        if series is None:
            continue
        title, sections = _sections(text)
        for section, body in sections:
            documents.append(
                Document(
                    page_content=body,
                    metadata={
                        "source": path.name,
                        "title": title,
                        "series": series,
                        "section": section,
                    },
                )
            )
    return documents


def _number_and_label(chunks):
    """Number chunks per file and prefix each one with its saga and section."""
    counts: dict[str, int] = {}
    for chunk in chunks:
        source = chunk.metadata.get("source", "")
        number = counts.get(source, 0)
        counts[source] = number + 1
        chunk.metadata["chunk"] = number
        title = chunk.metadata.get("title", "")
        section = chunk.metadata.get("section", "")
        chunk.page_content = f"{title} > {section}\n\n{chunk.page_content}"
    return chunks


class _QueryPrefix:
    """Prefix queries the way bge expects. Passages stay unchanged."""

    def __init__(self, inner):
        self._inner = inner

    def embed_documents(self, texts):
        return self._inner.embed_documents(texts)

    def embed_query(self, text):
        return self._inner.embed_query(QUERY_PREFIX + text)


_embeddings = None
_reranker = None


def default_embeddings():
    global _embeddings
    if _embeddings is None:
        from langchain_huggingface import HuggingFaceEmbeddings

        _embeddings = _QueryPrefix(
            HuggingFaceEmbeddings(
                model_name=EMBED_MODEL,
                model_kwargs={"device": "cuda"},
            )
        )
    return _embeddings


def default_reranker():
    global _reranker
    if _reranker is None:
        from sentence_transformers import CrossEncoder

        _reranker = CrossEncoder(RERANK_MODEL, device="cuda")
    return _reranker


def _index_ready(index_dir: Path) -> bool:
    return (index_dir / "chroma.sqlite3").is_file()


def _open_store(index_dir: Path, embeddings):
    from langchain_chroma import Chroma

    if not _index_ready(index_dir):
        raise IndexMissing()
    return Chroma(
        collection_name=COLLECTION,
        persist_directory=str(index_dir),
        embedding_function=embeddings,
    )


def build_index(canon_dir=None, index_dir=None, embeddings=None) -> int:
    canon_dir = Path(canon_dir) if canon_dir else CANON_DIR
    index_dir = Path(index_dir) if index_dir else INDEX_DIR
    if index_dir.resolve() == canon_dir.resolve():
        raise RuntimeError("Refusing to replace the canon directory")
    embeddings = embeddings if embeddings is not None else default_embeddings()
    chunks = _number_and_label(_splitter().split_documents(load_documents(canon_dir)))
    if not chunks:
        raise RuntimeError(f"No canon text files in {canon_dir}")
    if index_dir.exists():
        shutil.rmtree(index_dir)
    index_dir.mkdir(parents=True, exist_ok=True)
    from langchain_chroma import Chroma

    Chroma.from_documents(
        chunks,
        embeddings,
        collection_name=COLLECTION,
        persist_directory=str(index_dir),
    )
    return len(chunks)


def _rerank(query: str, docs, reranker, k: int, min_score: float = MIN_RERANK_SCORE):
    if not docs:
        return []
    scores = reranker.predict([(query, doc.page_content) for doc in docs])
    order = sorted(range(len(docs)), key=lambda index: float(scores[index]), reverse=True)
    kept = []
    for index in order:
        if float(scores[index]) < min_score:
            break
        kept.append(docs[index])
        if len(kept) >= k:
            break
    return kept


def _chunk_after(store, doc):
    source = doc.metadata.get("source")
    number = doc.metadata.get("chunk")
    if not source or not isinstance(number, int):
        return None
    found = store.get(where={"$and": [{"source": source}, {"chunk": number + 1}]})
    documents = found.get("documents") or []
    if not documents:
        return None
    from langchain_core.documents import Document

    metadatas = found.get("metadatas") or [{}]
    return Document(page_content=documents[0], metadata=metadatas[0] or {})


def _attach_next(store, hits):
    """Place the following chunk from the same file directly after each hit."""
    ordered = []
    seen = set()
    for doc in hits:
        key = (doc.metadata.get("source"), doc.metadata.get("chunk"))
        if key not in seen:
            seen.add(key)
            ordered.append(doc)
        nxt = _chunk_after(store, doc)
        if nxt is None:
            continue
        nkey = (nxt.metadata.get("source"), nxt.metadata.get("chunk"))
        if nkey in seen:
            continue
        seen.add(nkey)
        insert_at = 1 + next(
            index
            for index, item in enumerate(ordered)
            if (item.metadata.get("source"), item.metadata.get("chunk")) == key
        )
        ordered.insert(insert_at, nxt)
    return ordered


def _passages(docs) -> list[Passage]:
    return [
        Passage(
            source=doc.metadata.get("source", ""),
            title=doc.metadata.get("title", ""),
            text=doc.page_content,
        )
        for doc in docs
    ]


def retrieve(query: str, *, index_dir=None, embeddings=None, reranker=None) -> list[Passage]:
    index_dir = Path(index_dir) if index_dir else INDEX_DIR
    if not _index_ready(index_dir):
        raise IndexMissing()
    embeddings = embeddings if embeddings is not None else default_embeddings()
    reranker = reranker if reranker is not None else default_reranker()
    store = _open_store(index_dir, embeddings)
    docs = store.similarity_search(query, k=CANDIDATES, filter={"series": "z"})
    ranked = _rerank(query, docs, reranker, TOP_K)
    return _passages(_attach_next(store, ranked))


def _latest_user(messages) -> str:
    for message in reversed(messages):
        if message.get("role") == "user":
            return (message.get("content") or "").strip()
    return ""


def format_passages(passages: list[Passage]) -> str:
    blocks = [f"[{passage.source}]\n{passage.text.strip()}" for passage in passages]
    instruction = (
        "Answer lore questions only from these passages. "
        "If they do not contain the answer, say so. "
        "Do not merge different characters or forms."
    )
    return "Canon passages:\n" + instruction + "\n\n" + "\n\n".join(blocks)


def prepare(messages, *, index_dir=None, embeddings=None, reranker=None):
    """Return a copied message list plus the passages used to build it."""
    query = _latest_user(messages)
    passages = (
        retrieve(query, index_dir=index_dir, embeddings=embeddings, reranker=reranker)
        if query
        else []
    )
    copied = [dict(message) for message in messages]
    if not passages:
        return copied, passages
    context = {"role": "system", "content": format_passages(passages)}
    insert_at = 1 if copied and copied[0].get("role") == "system" else 0
    copied.insert(insert_at, context)
    return copied, passages


def with_canon(messages, *, index_dir=None, embeddings=None, reranker=None):
    prepared, _passages = prepare(
        messages, index_dir=index_dir, embeddings=embeddings, reranker=reranker
    )
    return prepared


def wrap_trace(fn, name):
    """Trace fn when LANGSMITH_API_KEY is set. A missing key or package leaves fn unchanged."""
    if not os.environ.get("LANGSMITH_API_KEY", "").strip():
        return fn
    try:
        from langsmith import traceable
    except ImportError:
        return fn
    os.environ["LANGSMITH_TRACING"] = "true"
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    return traceable(name=name)(fn)


retrieve = wrap_trace(retrieve, "retrieve")


def main() -> None:
    count = build_index()
    print(f"Indexed {count} passages into {INDEX_DIR}")


if __name__ == "__main__":
    main()
