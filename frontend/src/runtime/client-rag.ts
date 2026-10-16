import { AutoTokenizer, BertModel, env } from "@xenova/transformers";

// Pages does not host ONNX weights under /models — skip local probes (404 noise).
env.allowLocalModels = false;

const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";
const CANDIDATES = 40;
/** Keep the character prompt short — 1.5B ignores long multi-hit dumps. */
const TOP_K = 2;
/** Cosine floor; weak queries like "hi" fall below and return no lore. */
const MIN_SCORE = 0.4;
/** Drop heading-only / stub bodies (e.g. "Appearance\\n\\nPersonality"). */
const MIN_BODY_CHARS = 80;

let indexData: {
  documents: string[];
  metadatas: Array<{ source: string; title: string; series: string; section: string }>;
  embeddings: number[][];
} | null = null;

let tokenizer: any = null;
let model: any = null;
let initialized = false;
let initPromise: Promise<void> | null = null;
let lastError: Error | null = null;

export interface Passage {
  source: string;
  title: string;
  text: string;
  score: number;
}

export type RagProgressCallback = (progress: number, message: string) => void;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** @deprecated Prefer ensureRAG — same behavior. */
export async function initRAG(onProgress?: RagProgressCallback): Promise<void> {
  return ensureRAG(onProgress);
}

/** Load rag-index + embedder once. No-op if already ready. */
export async function ensureRAG(onProgress?: RagProgressCallback): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  lastError = null;
  initPromise = (async () => {
    try {
      onProgress?.(0.05, "Fetching lore index…");

      const response = await fetch(`${import.meta.env.BASE_URL}rag-index.json`);
      if (!response.ok) throw new Error("Failed to load rag-index.json");
      indexData = await response.json();

      onProgress?.(0.35, "Loading lore embedder…");

      tokenizer = await AutoTokenizer.from_pretrained("Xenova/bge-base-en-v1.5");
      model = await BertModel.from_pretrained("Xenova/bge-base-en-v1.5", {
        quantized: true,
      });

      initialized = true;
      lastError = null;
      onProgress?.(1.0, "Lore ready");
    } catch (error) {
      initPromise = null;
      indexData = null;
      tokenizer = null;
      model = null;
      initialized = false;
      lastError = error instanceof Error ? error : new Error(String(error));
      throw lastError;
    }
  })();

  return initPromise;
}

async function embedQuery(query: string): Promise<number[]> {
  if (!tokenizer || !model) throw new Error("RAG not initialized");

  const inputs = tokenizer(QUERY_PREFIX + query, {
    padding: true,
    truncation: true,
    max_length: 512,
    return_tensors: "pt",
  });

  const output = await model(inputs);
  const embeddings = output.last_hidden_state;
  const clsEmbedding = embeddings[0][0];
  return Array.from(clsEmbedding.data);
}

function bodyLength(document: string): number {
  const parts = document.split("\n\n");
  const body = parts.length > 1 ? parts.slice(1).join("\n\n") : document;
  return body.trim().length;
}

function isThinDocument(document: string): boolean {
  return bodyLength(document) < MIN_BODY_CHARS;
}

export async function retrieve(query: string): Promise<Passage[]> {
  if (!initialized || !indexData) throw new Error("RAG not initialized");

  const queryEmbedding = await embedQuery(query);

  const similarities = indexData.embeddings
    .map((docEmbedding, index) => ({
      index,
      score: cosineSimilarity(queryEmbedding, docEmbedding),
    }))
    .filter(({ index }) => !isThinDocument(indexData!.documents[index]));

  similarities.sort((a, b) => b.score - a.score);

  if (!similarities.length) {
    console.log("RAG retrieve: no non-thin passages");
    return [];
  }

  const best = similarities[0].score;
  if (best < MIN_SCORE) {
    console.log(
      `RAG retrieve: skipped (best score ${best.toFixed(4)} < ${MIN_SCORE})`,
    );
    return [];
  }

  const passages: Passage[] = similarities.slice(0, TOP_K).map(({ index, score }) => {
    const meta = indexData!.metadatas[index];
    return {
      source: meta.source,
      title: meta.title,
      text: indexData!.documents[index],
      score,
    };
  });

  return passages;
}

export function formatPassages(passages: Passage[]): string {
  const blocks = passages.map((p) => `[${p.source}]\n${p.text.trim()}`);
  const instruction =
    "Use these passages only for names and events. " +
    "Reply in the voice you were given, in a few short sentences. " +
    'Do not write a summary, name a saga, or say "the Z Fighters." ' +
    "If the passages do not contain the answer, say you do not know, still in that voice. " +
    "Do not merge different characters or forms.";
  return "Canon passages:\n" + instruction + "\n\n" + blocks.join("\n\n");
}

/** Short fact block for the character model after extractFact succeeds. */
export function formatFact(fact: string): string {
  return (
    "Canon fact (use this; do not invent a different answer):\n" +
    fact.trim() +
    "\n\nReply in the voice you were given, in a few short sentences."
  );
}

export function isRAGReady(): boolean {
  return initialized;
}

export function getRAGError(): Error | null {
  return lastError;
}

export function isInitialized(): boolean {
  return initialized;
}

/** @deprecated Prefer ensureRAG. */
export async function createRag(onProgress?: RagProgressCallback): Promise<void> {
  return ensureRAG(onProgress);
}
