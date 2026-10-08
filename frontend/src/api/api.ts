import type { components } from "./api-types";

export type Session = components["schemas"]["SessionOut"];
export type ChatMessage = components["schemas"]["ChatMessage"];
export type SessionSummary = components["schemas"]["SessionSummary"];
type CharacterId = components["schemas"]["CreateSessionIn"]["character"];
type SendMessageIn = components["schemas"]["SendMessageIn"];

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

export function sendMessage(
  sessionId: string,
  content: string,
  signal?: AbortSignal,
): Promise<Session> {
  const body: SendMessageIn = { content };
  return request<Session>(
    `/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    signal,
  );
}

export function deleteSession(sessionId: string): Promise<void> {
  return request<void>(`/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
}
