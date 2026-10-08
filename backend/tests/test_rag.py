import math
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from langchain_core.documents import Document

from rag import (
    TOP_K,
    IndexMissing,
    _rerank,
    build_index,
    load_documents,
    retrieve,
    series_for,
    with_canon,
)


class HashEmbeddings:
    """Bag-of-words vectors so tests never download an embedding model."""

    def embed_documents(self, texts):
        return [self.embed_query(text) for text in texts]

    def embed_query(self, text):
        vector = [0.0] * 64
        for token in re.findall(r"[a-z0-9]+", text.casefold()):
            vector[hash(token) % 64] += 1.0
        norm = math.sqrt(sum(value * value for value in vector)) or 1.0
        return [value / norm for value in vector]


class OverlapReranker:
    """Score by shared words so tests never download a cross-encoder."""

    def predict(self, pairs):
        scores = []
        for query, text in pairs:
            query_words = set(re.findall(r"[a-z0-9]+", query.casefold()))
            text_words = set(re.findall(r"[a-z0-9]+", text.casefold()))
            scores.append(float(len(query_words & text_words)))
        return scores


class Prefer:
    def __init__(self, needle: str):
        self.needle = needle

    def predict(self, pairs):
        return [1.0 if self.needle in text else 0.0 for _query, text in pairs]


def _write(canon: Path, relative: str, body: str):
    path = canon / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    return path


def _canon(tmp_path: Path) -> Path:
    canon = tmp_path / "canon"
    _write(
        canon,
        "z/vegeta_saga.txt",
        "Vegeta Saga\n\nVegeta killed Nappa. A Saibaman killed Yamcha.\n",
    )
    _write(
        canon,
        "z/namek_saga.txt",
        "Namek Saga\n\nThe eternal dragon on Namek is Porunga.\n",
    )
    _write(
        canon,
        "super/gods_of_the_universe_saga.txt",
        "Gods of the Universe Saga\n\nBeerus is the God of Destruction.\n",
    )
    _write(
        canon,
        "super/later_super_saga.txt",
        "Later Super Saga\n\nWhis revived Frieza.\n",
    )
    _write(
        canon,
        "characters/frieza.txt",
        "Frieza\n\nGolden Frieza trained after his revival.\n",
    )
    return canon


def test_series_tags():
    canon = Path("/tmp/canon-tags")
    assert series_for(canon / "z" / "vegeta_saga.txt", canon) == "z"
    assert series_for(canon / "vegeta_saga.txt", canon) is None
    assert series_for(canon / "super" / "gods_of_the_universe_saga.txt", canon) == "super"
    assert series_for(canon / "super" / "later_super_saga.txt", canon) == "super"
    assert series_for(canon / "characters" / "frieza.txt", canon) == "mixed"


def test_retrieve_keeps_z_and_drops_super_and_mixed(tmp_path):
    canon = _canon(tmp_path)
    index = tmp_path / "index"
    embeddings = HashEmbeddings()
    count = build_index(canon, index, embeddings=embeddings)
    assert count >= 5

    found = retrieve(
        "Who killed Nappa?",
        index_dir=index,
        embeddings=embeddings,
        reranker=OverlapReranker(),
    )
    assert found
    assert {passage.source for passage in found} <= {"vegeta_saga.txt", "namek_saga.txt"}
    assert any("Nappa" in passage.text for passage in found)

    beerus = retrieve(
        "Tell me about Beerus.",
        index_dir=index,
        embeddings=embeddings,
        reranker=OverlapReranker(),
    )
    assert all(passage.source != "gods_of_the_universe_saga.txt" for passage in beerus)
    assert all(passage.source != "later_super_saga.txt" for passage in beerus)
    assert all("Golden Frieza" not in passage.text for passage in beerus)
    assert all("Beerus" not in passage.text for passage in beerus)
    assert all("Whis" not in passage.text for passage in beerus)


def test_long_text_splits(tmp_path):
    canon = tmp_path / "canon"
    paragraph = "Vegeta killed Nappa during the Saiyan fight. " * 40
    _write(canon, "z/vegeta_saga.txt", f"Vegeta Saga\n\n{paragraph}\n\n{paragraph}\n")
    count = build_index(canon, tmp_path / "index", embeddings=HashEmbeddings())
    assert count >= 2


def test_missing_index(tmp_path):
    with pytest.raises(IndexMissing, match="python -m rag"):
        retrieve(
            "Who killed Nappa?",
            index_dir=tmp_path / "missing",
            embeddings=HashEmbeddings(),
        )


def test_with_canon_inserts_context_without_mutating_input(tmp_path):
    canon = _canon(tmp_path)
    index = tmp_path / "index"
    embeddings = HashEmbeddings()
    build_index(canon, index, embeddings=embeddings)
    messages = [
        {"role": "system", "content": "You are Frieza."},
        {"role": "user", "content": "Who killed Nappa?"},
    ]
    prepared = with_canon(
        messages,
        index_dir=index,
        embeddings=embeddings,
        reranker=OverlapReranker(),
    )
    assert messages == [
        {"role": "system", "content": "You are Frieza."},
        {"role": "user", "content": "Who killed Nappa?"},
    ]
    assert prepared[0]["content"] == "You are Frieza."
    assert prepared[1]["role"] == "system"
    assert prepared[1]["content"].startswith("Canon passages:")
    assert "Answer lore questions only from these passages." in prepared[1]["content"]
    assert "[vegeta_saga.txt]" in prepared[1]["content"]
    assert "Nappa" in prepared[1]["content"]
    assert prepared[-1]["role"] == "user"


def test_rerank_drops_scores_below_the_minimum():
    docs = [
        Document(page_content="Vegito fought Super Buu.", metadata={"chunk": 0}),
        Document(page_content="Goku threw the Spirit Bomb at Kid Buu.", metadata={"chunk": 1}),
    ]

    class FixedScores:
        def predict(self, pairs):
            return [0.27, 0.14]

    ranked = _rerank("Who defeated Super Buu?", docs, FixedScores(), TOP_K)
    assert [doc.page_content for doc in ranked] == ["Vegito fought Super Buu."]


def test_rerank_puts_the_higher_score_first():
    docs = [
        Document(page_content="Porunga is the eternal dragon.", metadata={"chunk": 0}),
        Document(page_content="Vegeta killed Nappa.", metadata={"chunk": 1}),
    ]
    ranked = _rerank("Who killed Nappa?", docs, OverlapReranker(), 1)
    assert ranked[0].page_content == "Vegeta killed Nappa."


def test_headings_are_labels_not_chunks(tmp_path):
    canon = tmp_path / "canon"
    _write(
        canon,
        "z/fusion_saga.txt",
        "Fusion Saga\n"
        "https://dragonball.fandom.com/wiki/Fusion_Saga\n"
        "\n"
        "Plot\n"
        "\n"
        "Battle\n"
        "\n"
        "Vegeta killed Nappa in this fight.\n"
        "\n"
        "Outcome\n"
        "\n"
        "Buu reverted into Kid Buu after the rescue.\n",
    )
    docs = load_documents(canon)
    assert {doc.metadata["section"] for doc in docs} == {"Battle", "Outcome"}
    assert all(doc.page_content.strip() not in {"Plot", "Battle", "Outcome"} for doc in docs)
    assert all("fandom.com" not in doc.page_content for doc in docs)


def test_retrieve_reranks_ahead_of_the_vector_order(tmp_path):
    canon = tmp_path / "canon"
    _write(
        canon,
        "z/vegeta_saga.txt",
        "Vegeta Saga\n\n" + ("Vegeta killed Nappa. " * 20) + "\n",
    )
    _write(
        canon,
        "z/namek_saga.txt",
        "Namek Saga\n\nOUTCOME marker sits in this passage.\n",
    )
    index = tmp_path / "index"
    embeddings = HashEmbeddings()
    build_index(canon, index, embeddings=embeddings)
    found = retrieve(
        "Who killed Nappa?",
        index_dir=index,
        embeddings=embeddings,
        reranker=Prefer("OUTCOME"),
    )
    assert "OUTCOME" in found[0].text


def test_next_chunk_is_attached_once_and_labeled(tmp_path):
    canon = tmp_path / "canon"
    _write(
        canon,
        "z/fusion_saga.txt",
        "Fusion Saga\n"
        "https://dragonball.fandom.com/wiki/Fusion_Saga\n"
        "\n"
        "Plot\n"
        "\n"
        "Battle\n"
        "\n"
        "Vegeta killed Nappa in this fight.\n"
        "\n"
        "Outcome\n"
        "\n"
        "Buu reverted into Kid Buu after the rescue.\n",
    )
    index = tmp_path / "index"
    embeddings = HashEmbeddings()
    build_index(canon, index, embeddings=embeddings)
    found = retrieve(
        "Who killed Nappa?",
        index_dir=index,
        embeddings=embeddings,
        reranker=OverlapReranker(),
    )
    texts = [passage.text for passage in found]
    assert texts[0].startswith("Fusion Saga > Battle")
    nappa_at = next(index for index, text in enumerate(texts) if "killed Nappa" in text)
    assert "Kid Buu" in texts[nappa_at + 1]
    assert texts[nappa_at + 1].startswith("Fusion Saga > Outcome")
    assert sum("Kid Buu" in text for text in texts) == 1
    assert all("fandom.com" not in text for text in texts)
