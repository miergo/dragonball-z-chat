import { AutoTokenizer, BertModel, env } from "@xenova/transformers";

// Pages does not host ONNX weights under /models — skip local probes (404 noise).
env.allowLocalModels = false;

const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";
const CANDIDATES = 40;
const TOP_K = 5;

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

export async function retrieve(query: string): Promise<Passage[]> {
  if (!initialized || !indexData) throw new Error("RAG not initialized");

  const queryEmbedding = await embedQuery(query);

  const similarities = indexData.embeddings.map((docEmbedding, index) => ({
    index,
    score: cosineSimilarity(queryEmbedding, docEmbedding),
  }));

  similarities.sort((a, b) => b.score - a.score);
  const topCandidates = similarities.slice(0, CANDIDATES);

  const passages: Passage[] = topCandidates.slice(0, TOP_K).map(({ index }) => {
    const meta = indexData!.metadatas[index];
    return {
      source: meta.source,
      title: meta.title,
      text: indexData!.documents[index],
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
