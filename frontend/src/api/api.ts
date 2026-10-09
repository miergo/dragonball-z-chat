import type { components } from "./api-types";

export type Session = components["schemas"]["SessionOut"];
export type ChatMessage = components["schemas"]["ChatMessage"];
export type SessionSummary = components["schemas"]["SessionSummary"];
type CharacterId = components["schemas"]["CreateSessionIn"]["character"];
type SendMessageIn = components["schemas"]["SendMessageIn"];

export type SendEvent = {
  type: "start" | "line" | "done" | "error";
  message?: ChatMessage;
  partner?: CharacterId | null;
  next?: CharacterId | null;
  detail?: string;
};

const API = "/api";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

async function request<T>(path: string, init?: RequestInit, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, signal ? { ...init, signal } : init);
  } catch (err) {
    if (isAbort(err)) throw err;
    throw new ApiError(
      0,
      "Can't reach the local chat API. Start it with python api.py in the backend folder, then try again.",
    );
  }
  if (res.status === 204) return undefined as T;
  if (res.ok) return (await res.json()) as T;
  return fail(res);
}

async function fail(res: Response): Promise<never> {
  let detail = "";
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string") detail = body.detail;
  } catch {
    detail = "";
  }
  if (detail) throw new ApiError(res.status, detail);
  if (res.status === 404) throw new ApiError(404, "That session is gone.");
  if (res.status === 502) {
    throw new ApiError(502, "The local model didn't answer. Try sending again.");
  }
  throw new ApiError(res.status, "Something went wrong. Try again.");
}

function eventBlock(block: string): SendEvent | null {
  const data = block
    .split("\n")
    .filter((row) => row.startsWith("data: "))
    .map((row) => row.slice(6))
    .join("\n");
  if (!data.trim()) return null;
  return JSON.parse(data) as SendEvent;
}

async function readEvents(res: Response, onEvent?: (event: SendEvent) => void): Promise<null> {
  if (!res.body) throw new ApiError(502, "The local model didn't answer. Try sending again.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  let failed = "";
  const take = (block: string) => {
    let event: SendEvent;
    try {
      const parsed = eventBlock(block);
      if (!parsed) return;
      event = parsed;
    } catch {
      throw new ApiError(502, "The local model didn't answer. Try sending again.");
    }
    if (event.type === "error") {
      failed = event.detail || "The local model didn't answer. Try sending again.";
    }
    if (event.type === "done") done = true;
    onEvent?.(event);
  };
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) take(block);
  }
  buffer += decoder.decode();
  if (buffer.trim()) take(buffer);
  if (failed) throw new ApiError(502, failed);
  if (!done) throw new ApiError(502, "The local model didn't answer. Try sending again.");
  return null;
}

export function openSession(
  character: CharacterId,
  fresh: boolean,
  signal?: AbortSignal,
): Promise<Session> {
  const body: components["schemas"]["CreateSessionIn"] = { character };
  return request<Session>(
    `/sessions?fresh=${fresh ? "true" : "false"}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    signal,
  );
}

export function listSessions(character: CharacterId, signal?: AbortSignal): Promise<SessionSummary[]> {
  return request<SessionSummary[]>(`/sessions?character=${encodeURIComponent(character)}`, undefined, signal);
}

export function getSession(sessionId: string, signal?: AbortSignal): Promise<Session> {
  return request<Session>(`/sessions/${encodeURIComponent(sessionId)}`, undefined, signal);
}

export function greet(sessionId: string, signal?: AbortSignal): Promise<Session> {
  return request<Session>(
    `/sessions/${encodeURIComponent(sessionId)}/greet`,
    { method: "POST" },
    signal,
  );
}

export async function sendMessage(
  sessionId: string,
  content: string,
  signal?: AbortSignal,
  onEvent?: (event: SendEvent) => void,
): Promise<Session | null> {
  const body: SendMessageIn = { content };
  let res: Response;
  try {
    res = await fetch(`${API}/sessions/${encodeURIComponent(sessionId)}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream, application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (isAbort(err)) throw err;
    throw new ApiError(
      0,
      "Can't reach the local chat API. Start it with python api.py in the backend folder, then try again.",
    );
  }
  if (!res.ok) return fail(res);
  const kind = res.headers.get("content-type") ?? "";
  if (kind.includes("text/event-stream")) return readEvents(res, onEvent);
  return (await res.json()) as Session;
}

export function deleteSession(sessionId: string): Promise<void> {
  return request<void>(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
}
