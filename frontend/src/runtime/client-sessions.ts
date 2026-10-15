import initSqlJs, { Database } from "sql.js";

const DB_NAME = "dbz-sessions";
const STORAGE_KEY = "dbz-sqlite-db";

let db: Database | null = null;
let initialized = false;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  speaker?: string;
  timestamp: number;
}

export interface Session {
  id: string;
  character: string;
  partner?: string | null;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface SessionSummary {
  id: string;
  preview: string;
  character: string;
  updatedAt: number;
}

export interface MemoryEntry {
  character: string;
  summary: string;
  updatedAt: number;
}

const wasmUrl = `${import.meta.env.BASE_URL}sql-wasm.wasm`;

function saveToStorage(): void {
  if (!db) return;
  const data = db.export();
  localStorage.setItem(STORAGE_KEY, btoa(String.fromCharCode(...data)));
}

function loadFromStorage(): Uint8Array | null {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return null;
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function initSessions(): Promise<void> {
  if (initialized) return;

  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const savedData = loadFromStorage();

  if (savedData) {
    db = new SQL.Database(savedData);
  } else {
    db = new SQL.Database();
    db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        character TEXT NOT NULL,
        partner TEXT,
        messages TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS memories (
        character TEXT PRIMARY KEY,
        summary TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    saveToStorage();
  }

  initialized = true;
}

function generateId(): string {
  return crypto.randomUUID();
}

function rowToSession(row: any): Session {
  return {
    id: row[0],
    character: row[1],
    partner: row[2],
    messages: JSON.parse(row[3]),
    createdAt: row[4],
    updatedAt: row[5],
  };
}

export function createSession(character: string, fresh: boolean): Session {
  if (!db) throw new Error("Sessions not initialized");

  const now = Date.now();
  const id = generateId();
  const session: Session = {
    id,
    character,
    partner: null,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  db.run(
    "INSERT INTO sessions (id, character, partner, messages, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, character, null, JSON.stringify([]), now, now]
  );
  saveToStorage();

  return session;
}

export function getSession(id: string): Session | null {
  if (!db) throw new Error("Sessions not initialized");

  const stmt = db.prepare("SELECT id, character, partner, messages, created_at, updated_at FROM sessions WHERE id = ?");
  stmt.bind([id]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();

  if (!row) return null;
  return rowToSession(Object.values(row));
}

export function listSessions(character: string, signal?: AbortSignal): Promise<SessionSummary[]> {
  if (!db) throw new Error("Sessions not initialized");

  const stmt = db.prepare(
    "SELECT id, character, messages, updated_at FROM sessions WHERE character = ? ORDER BY updated_at DESC"
  );
  stmt.bind([character]);

  const results: SessionSummary[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    const messages = JSON.parse(row.messages as string);
    const preview = messages.find((m: any) => m.role === "user")?.content?.slice(0, 60) || "No Messages";
    results.push({
      id: row.id as string,
      preview,
      character: row.character as string,
      updatedAt: row.updated_at as number,
    });
  }
  stmt.free();

  return Promise.resolve(results);
}

export function saveMessage(sessionId: string, message: ChatMessage): void {
  if (!db) throw new Error("Sessions not initialized");

  const session = getSession(sessionId);
  if (!session) throw new Error("Session not found");

  session.messages.push(message);
  session.updatedAt = Date.now();

  db.run(
    "UPDATE sessions SET messages = ?, updated_at = ? WHERE id = ?",
    [JSON.stringify(session.messages), session.updatedAt, sessionId]
  );
  saveToStorage();
}

export function setPartner(sessionId: string, partnerId: string | null): void {
  if (!db) throw new Error("Sessions not initialized");

  const now = Date.now();
  db.run("UPDATE sessions SET partner = ?, updated_at = ? WHERE id = ?", [partnerId, now, sessionId]);
  saveToStorage();
}

export function deleteSession(id: string): void {
  if (!db) throw new Error("Sessions not initialized");

  db.run("DELETE FROM sessions WHERE id = ?", [id]);
  saveToStorage();
}

export function loadMemory(character: string): string {
  if (!db) throw new Error("Sessions not initialized");

  const stmt = db.prepare("SELECT summary FROM memories WHERE character = ?");
  stmt.bind([character]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();

  return (row?.summary as string) || "";
}

export function saveMemory(character: string, summary: string): void {
  if (!db) throw new Error("Sessions not initialized");

  const now = Date.now();
  db.run(
    "INSERT OR REPLACE INTO memories (character, summary, updated_at) VALUES (?, ?, ?)",
    [character, summary, now]
  );
  saveToStorage();
}

export function isInitialized(): boolean {
  return initialized;
}