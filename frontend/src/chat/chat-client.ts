import {
  type ChatMessage,
  type Session,
  type SessionSummary,
} from "../api/api";
import { STAR_JA, fighters, type CharacterId, type Fighter } from "../characters/characters";
import { setFighterIdentity } from "../characters/identity";
import { frozenChat, sampleFor } from "./sample";
import { ensureLLM, chat, isLLMReady } from "../runtime/client-llm";
import { assessDevice, type DeviceAssessment } from "../runtime/device-capability";
import {
  initSessions,
  createSession as createLocalSession,
  getSession as getLocalSession,
  listSessions as listLocalSessions,
  saveMessage as saveLocalMessage,
  setPartner as setLocalPartner,
  deleteSession as deleteLocalSession,
  loadMemory,
} from "../runtime/client-sessions";

/** Keep WebLLM KV cache small on low-RAM devices. */
const MAX_HISTORY_MESSAGES = 8;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const LEAVE_MS = 660;

function liftCharacter(root: HTMLElement, hero: HTMLElement, portrait: HTMLElement): HTMLElement | null {
  const pop = document.querySelector(".card.is-active .pop");
  if (!pop) return null;
  const portraitHidden = getComputedStyle(portrait).display === "none";
  const source = portraitHidden
    ? hero.querySelector<HTMLElement>(".msg-icon")
    : portrait.querySelector<HTMLElement>("img, .seal");
  if (!source) return null;
  const from = source.getBoundingClientRect();
  const to = pop.getBoundingClientRect();
  if (from.width === 0 || to.width === 0) return null;
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.classList.add("character-front");
  ghost.style.left = `${from.left}px`;
  ghost.style.top = `${from.top}px`;
  ghost.style.width = `${from.width}px`;
  ghost.style.height = `${from.height}px`;
  document.body.append(ghost);
  source.style.visibility = "hidden";
  const x = from.left + from.width / 2;
  const y = from.top + from.height / 2;
  root.style.transformOrigin = `${x}px ${y}px`;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ghost.style.left = `${to.left}px`;
      ghost.style.top = `${to.top}px`;
      ghost.style.width = `${to.width}px`;
      ghost.style.height = `${to.height}px`;
    });
  });
  return ghost;
}

export function createChat(opts: { onClose: () => void }) {
  const root = document.querySelector<HTMLElement>("#chat")!;
  const hero = document.querySelector<HTMLElement>("#chat-hero")!;
  const portrait = document.querySelector<HTMLElement>("#chat-portrait")!;
  const kicker = document.querySelector<HTMLElement>("#chat-kicker")!;
  const nameEl = document.querySelector<HTMLElement>("#chat-name")!;
  const jaEl = document.querySelector<HTMLElement>("#chat-ja")!;
  const markEl = document.querySelector<HTMLElement>("#chat-mark")!;
  const log = document.querySelector<HTMLElement>("#chat-log")!;
  const errorBox = document.querySelector<HTMLElement>("#chat-error")!;
  const errorText = document.querySelector<HTMLElement>("#chat-error-text")!;
  const retry = document.querySelector<HTMLButtonElement>("#chat-retry")!;
  const confirmBox = document.querySelector<HTMLElement>("#chat-confirm")!;
  const confirmCopy = document.querySelector<HTMLElement>("#chat-confirm-copy")!;
  const form = document.querySelector<HTMLFormElement>("#chat-form")!;
  const input = document.querySelector<HTMLInputElement>("#chat-input")!;
  const sendBtn = document.querySelector<HTMLButtonElement>("#chat-send")!;
  const newBtn = document.querySelector<HTMLButtonElement>("#chat-new")!;
  const deleteBtn = document.querySelector<HTMLButtonElement>("#chat-delete")!;
  const historyList = document.querySelector<HTMLElement>("#chat-history")!;

  let fighter: Fighter | null = null;
  let partnerId: CharacterId | null = null;
  let sessionId: string | null = null;
  let messages: ChatMessage[] = [];
  let phase: Phase = "ready";
  let error = "";
  let confirm = false;
  let token = 0;
  let leaving = false;
  let flight: AbortController | null = null;
  let shown: ChatMessage[] = [];
  let paintedFighter: Fighter | null = null;
  let pendingRow: HTMLElement | null = null;
  let pendingBody: HTMLElement | null = null;
  let pendingKind: "loading" | "wait" | null = null;
  let pendingLabel = "";
  let pendingNext: CharacterId | null | undefined = undefined;
  let emptyNote: HTMLElement | null = null;
  let historyFlight: AbortController | null = null;
  let historyButtons: { id: string; button: HTMLButtonElement }[] = [];
  let deviceAssessment: DeviceAssessment | null = null;
  /** Set when WebGPU/RAM gate fails — TODO: frozen fallback (right branch). */
  let llmBlocked = false;
  let modelLoading = false;

  function nextSignal(): AbortSignal {
    flight?.abort();
    flight = new AbortController();
    return flight.signal;
  }

  function historyNote(text: string): void {
    historyButtons = [];
    const note = document.createElement("li");
    note.className = "chat-history-note";
    note.textContent = text;
    historyList.replaceChildren(note);
  }

  function paintHistory(list: SessionSummary[]): void {
    if (list.length === 0) {
      historyNote("No past sessions yet.");
      return;
    }
    historyButtons = list.map((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chat-history-item";
      const label = document.createElement("span");
      label.className = "chat-history-id";
      label.textContent = `Session ${list.length - index}`;
      const preview = document.createElement("span");
      preview.className = "chat-history-preview";
      preview.textContent = item.preview === "No Messages" ? "Not started yet" : item.preview;
      button.append(label, preview);
      button.addEventListener("click", () => pick(item.id));
      return { id: item.id, button };
    });
    historyList.replaceChildren(
      ...historyButtons.map(({ button }) => {
        const li = document.createElement("li");
        li.append(button);
        return li;
      }),
    );
    render();
  }

  function refreshHistory(person: Fighter, current: number): void {
    if (!person.id) return;
    historyFlight?.abort();
    historyFlight = new AbortController();
    void listLocalSessions(person.id, historyFlight.signal)
      .then((list) => {
        if (current === token) paintHistory(list);
      })
      .catch((err: unknown) => {
        if (current !== token || isAbort(err)) return;
        historyNote("Couldn't load past sessions.");
      });
  }

  function pick(id: string): void {
    if (frozenChat || !fighter?.id || id === sessionId || confirm) return;
    if (phase === "loading" || phase === "greeting" || phase === "sending") return;
    sessionId = null;
    messages = [];
    error = "";
    phase = "loading";
    forgetPartner();
    const current = ++token;
    render();
    void load(fighter, false, current, id);
  }

  function isAbort(err: unknown): boolean {
    return err instanceof Error && err.name === "AbortError";
  }

  function icon(person: Fighter): HTMLElement {
    const el = document.createElement("span");
    el.className = "msg-icon";
    el.setAttribute("aria-hidden", "true");
    if (person.image) {
      const img = document.createElement("img");
      img.src = person.image;
      img.alt = "";
      el.append(img);
      return el;
    }
    el.classList.add("msg-icon-seal");
    el.textContent = String(person.stars);
    return el;
  }

  function partnerFighter(): Fighter | null {
    if (!partnerId || partnerId === fighter?.id) return null;
    return fighters.find((item) => item.id === partnerId) ?? null;
  }

  function forgetPartner(): void {
    if (!partnerId) return;
    partnerId = null;
    if (fighter) paintIdentity(fighter);
  }

  function takeSession(session: Session): void {
    sessionId = session.id;
    messages = session.messages;
    const next = session.partner ?? null;
    if (next === partnerId) return;
    partnerId = next;
    if (fighter) paintIdentity(fighter);
  }

  function paintIdentity(person: Fighter): void {
    const partner = partnerFighter();
    root.classList[partner ? "add" : "remove"]("is-duo");
    if (partner) {
      person = {
        ...person,
        name: `${person.name} & ${partner.name}`,
        nameJa: `${person.nameJa}・${partner.nameJa}`,
      };
    }
    root.style.setProperty("--aura", person.color);
    setFighterIdentity(person, "chat", {
      name: nameEl,
      nameJa: jaEl,
      line: kicker,
      figure: portrait,
      hero,
    });
    markEl.textContent = STAR_JA[person.stars]?.slice(0, 1) ?? "";
    input.placeholder = `Say something to ${person.name}…`;
    input.setAttribute("aria-label", `Message to ${person.name}`);
    confirmCopy.textContent = `Delete this session with ${person.name}?`;
  }

  function nameKeys(person: Fighter): string[] {
    const keys = [person.name.toLowerCase()];
    if (person.id) keys.push(person.id.replace(/_/g, " ").toLowerCase());
    return keys;
  }

  function mentions(text: string, person: Fighter): boolean {
    return nameKeys(person).some((key) => {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b`, "i").test(text);
    });
  }

  function addressed(text: string, primary: Fighter, partner: Fighter): Fighter | null {
    const match = text.match(/^(?:hey\s+|okay\s+|ok\s+)?(.+?)\s*[,:]/i);
    if (!match) return null;
    const head = match[1].trim().toLowerCase();
    const hits = [primary, partner].filter((person) => nameKeys(person).includes(head));
    return hits.length === 1 ? hits[0] : null;
  }

  function aboutToSpeak(): Fighter | null {
    if (!fighter) return null;
    if (phase === "sending" && pendingNext === null) return null;
    if (phase === "sending" && pendingNext) {
      return fighters.find((item) => item.id === pendingNext) ?? fighter;
    }
    const partner = partnerFighter();
    if (phase !== "sending" || !partner) return fighter;
    const latest = [...messages].reverse().find((msg) => msg.role === "user");
    const text = latest?.content.trim() ?? "";
    if (!text || /\bbetween you two\b/i.test(text)) return fighter;
    const called = addressed(text, fighter, partner);
    if (called) return called;
    const named = [fighter, partner].filter((person) => mentions(text, person));
    return named.length === 1 ? named[0] : fighter;
  }

  function fighterFor(msg: ChatMessage): Fighter | null {
    if (!fighter) return null;
    if (msg.role !== "assistant" || !msg.speaker || msg.speaker === "user") return fighter;
    return fighters.find((item) => item.id === msg.speaker) ?? fighter;
  }

  function ki(): HTMLElement {
    const span = document.createElement("span");
    span.className = "ki";
    span.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
    return span;
  }

  function sameMessage(a: ChatMessage, b: ChatMessage): boolean {
    if (a.role !== b.role || a.content !== b.content) return false;
    if (!a.speaker || !b.speaker) return true;
    return a.speaker === b.speaker;
  }

  function samePrefix(prev: ChatMessage[], next: ChatMessage[]): boolean {
    if (next.length < prev.length) return false;
    for (let i = 0; i < prev.length; i += 1) {
      if (!sameMessage(prev[i], next[i])) return false;
    }
    return true;
  }

  function bubble(person: Fighter, role: ChatMessage["role"], body: HTMLElement): HTMLElement {
    const row = document.createElement("article");
    row.className = role === "user" ? "msg msg-user" : "msg msg-assistant";
    if (role === "assistant") {
      row.style.setProperty("--aura", person.color);
      row.append(icon(person));
    }
    const shell = document.createElement("div");
    shell.className = "bubble";
    const who = document.createElement("p");
    who.className = "bubble-name";
    who.textContent = role === "user" ? "You" : person.name;
    shell.append(who, body);
    row.append(shell);
    return row;
  }

  function appendMessage(msg: ChatMessage): void {
    const person = fighterFor(msg);
    if (!person) return;
    const body = document.createElement("p");
    body.textContent = msg.content;
    log.append(bubble(person, msg.role, body));
  }

  function fillPending(body: HTMLElement, person: Fighter, kind: "loading" | "wait"): void {
    body.className = "bubble-wait";
    body.replaceChildren();
    if (kind === "loading") {
      body.textContent = "Opening the line…";
      return;
    }
    body.textContent = "";
    body.append(ki());
    const sr = document.createElement("span");
    sr.className = "sr";
    sr.textContent = `Waiting for ${person.name}`;
    body.append(sr);
  }

  function appendPending(): void {
    const person = aboutToSpeak();
    if (!person) return;
    const kind = phase === "loading" ? "loading" : "wait";
    const body = document.createElement("p");
    fillPending(body, person, kind);
    const row = bubble(person, "assistant", body);
    row.classList.add("msg-pending");
    pendingRow = row;
    pendingBody = body;
    pendingKind = kind;
    pendingLabel = person.name;
    log.append(row);
  }

  function findClass(node: HTMLElement, token: string): HTMLElement | null {
    if (node.classList.contains(token)) return node;
    for (const child of node.children) {
      const found = findClass(child as HTMLElement, token);
      if (found) return found;
    }
    return null;
  }

  function renamePending(person: Fighter): void {
    if (!pendingRow || pendingLabel === person.name) return;
    pendingRow.style.setProperty("--aura", person.color);
    const who = findClass(pendingRow, "bubble-name");
    if (who) who.textContent = person.name;
    const old = findClass(pendingRow, "msg-icon");
    if (old && typeof old.replaceWith === "function") old.replaceWith(icon(person));
    pendingLabel = person.name;
  }

  function resetPending(): void {
    pendingRow = null;
    pendingBody = null;
    pendingKind = null;
    pendingLabel = "";
  }

  function rebuildLog(): void {
    log.replaceChildren();
    emptyNote = null;
    resetPending();
    shown = [];
    paintedFighter = fighter;
    if (!fighter) return;
    for (const msg of messages) appendMessage(msg);
    shown = messages.slice();
  }

  function syncMessages(busy: boolean): void {
    if (!fighter || paintedFighter !== fighter || !samePrefix(shown, messages)) {
      rebuildLog();
      return;
    }
    if (messages.length === shown.length) return;
    const held = pendingRow;
    held?.remove();
    for (const msg of messages.slice(shown.length)) appendMessage(msg);
    shown = messages.slice();
    if (held && busy) log.append(held);
  }

  function syncEmpty(): void {
    const person = fighter;
    if (!person || messages.length > 0 || phase !== "ready" || error) {
      emptyNote?.remove();
      emptyNote = null;
      return;
    }
    if (emptyNote) return;
    const note = document.createElement("p");
    note.className = "chat-empty";
    note.textContent = `${person.name} is on the line. Say something.`;
    emptyNote = note;
    log.append(note);
  }

  function syncPending(busy: boolean): void {
    const person = aboutToSpeak();
    if (!busy || !person) {
      pendingRow?.remove();
      resetPending();
      return;
    }
    const kind = phase === "loading" ? "loading" : "wait";
    if (!pendingRow || !pendingBody) {
      appendPending();
      return;
    }
    const labelChanged = pendingLabel !== person.name;
    renamePending(person);
    if (labelChanged || pendingKind !== kind) {
      fillPending(pendingBody, person, kind);
      pendingKind = kind;
    }
  }

  function render(): void {
    const busy = phase === "loading" || phase === "greeting" || phase === "sending" || modelLoading;
    syncMessages(busy);
    syncEmpty();
    syncPending(busy);
    log.scrollTop = log.scrollHeight;
    log.setAttribute("aria-busy", busy ? "true" : "false");

    errorText.textContent = error;
    errorBox.hidden = !error;
    // Show retry for session load failures (no session) or model load failures (has session).
    retry.hidden = !error || (sessionId !== null && !llmBlocked && isLLMReady());
    retry.textContent = llmBlocked || (!isLLMReady() && error.includes("local model"))
      ? "Retry model"
      : "Try again";
    confirmBox.hidden = !confirm;

    newBtn.hidden = frozenChat;
    deleteBtn.hidden = frozenChat;
    form.hidden = frozenChat;
    newBtn.disabled = busy || !fighter || frozenChat;
    deleteBtn.disabled = busy || !sessionId || frozenChat;
    sendBtn.disabled = busy || !sessionId || confirm || frozenChat || llmBlocked;
    input.disabled = busy || !sessionId || confirm || frozenChat || llmBlocked;
    for (const { id, button } of historyButtons) {
      const active = id === sessionId;
      button.classList[active ? "add" : "remove"]("is-current");
      if (active) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
      button.disabled = busy || confirm;
    }
  }

  function toApiSession(local: {
    id: string;
    character: string;
    partner?: string | null;
    messages: { role: "user" | "assistant"; content: string; speaker?: string }[];
  }): Session {
    const character = local.character as CharacterId;
    return {
      id: local.id,
      character,
      partner: (local.partner ?? null) as Session["partner"],
      messages: local.messages.map((m) => ({
        role: m.role,
        content: m.content,
        speaker: (m.speaker ?? (m.role === "user" ? "user" : character)) as ChatMessage["speaker"],
      })),
    };
  }

  async function load(person: Fighter, fresh: boolean, current: number, id?: string): Promise<void> {
    if (!person.id) return;

    try {
      await initSessions();

      let session: Session;
      if (id) {
        const local = getLocalSession(id);
        if (!local) throw new Error("Session not found");
        session = toApiSession(local);
      } else {
        session = toApiSession(createLocalSession(person.id, fresh));
      }

      if (current !== token) return;
      takeSession(session);
      error = "";
      // No Python greet on Pages — start ready with whatever messages exist.
      phase = "ready";
      refreshHistory(person, current);
    } catch (err) {
      if (current !== token || isAbort(err)) return;
      phase = "ready";
      error = err instanceof Error ? err.message : "Something went wrong. Try again.";
    }
    render();
    if (phase === "ready" && sessionId && !confirm) input.focus();
  }

  function initializeLocalApp() {
    // Sessions only — WebLLM stays lazy until capability OK + first send.
    void initSessions()
      .then(() => console.log("Local DB initialized"))
      .catch((err) => console.error("Failed to initialize local DB:", err));
  }

  function capHistory<T extends { role: string }>(msgs: T[]): T[] {
    let next = msgs.length > MAX_HISTORY_MESSAGES ? msgs.slice(-MAX_HISTORY_MESSAGES) : msgs.slice();
    while (next.length > 1 && next[0].role === "assistant") next = next.slice(1);
    return next;
  }

  async function prepareLiveModel(current: number): Promise<boolean> {
    const assessment = deviceAssessment ?? (await assessDevice());
    deviceAssessment = assessment;

    if (assessment.tier !== "live") {
      // TODO: frozen fallback (right branch)
      llmBlocked = true;
      error = assessment.reason || "This device can't run the local model.";
      return false;
    }

    llmBlocked = false;
    if (isLLMReady()) return true;

    modelLoading = true;
    error = "Loading local model…";
    render();

    try {
      await ensureLLM({
        onProgress: (progress, message) => {
          if (current !== token) return;
          console.log(`LLM progress: ${Math.round(progress * 100)}% - ${message}`);
          error = `Loading local model… ${Math.round(progress * 100)}% — ${message}`;
          render();
        },
      });
      if (current !== token) {
        modelLoading = false;
        return false;
      }
      error = "";
      modelLoading = false;
      console.log("LLM engine initialized");
      return true;
    } catch (err) {
      console.error("Failed to initialize LLM:", err);
      modelLoading = false;
      llmBlocked = true;
      // TODO: frozen fallback (right branch)
      error =
        err instanceof Error
          ? `This device couldn't load the local model. ${err.message}`
          : "This device couldn't load the local model.";
      return false;
    }
  }

  initializeLocalApp();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (frozenChat || !fighter || !sessionId || phase !== "ready" || confirm || llmBlocked || modelLoading) {
      return;
    }
    const text = input.value.trim();
    if (!text) return;
    const current = token;
    input.value = "";
    messages = [...messages, { role: "user", content: text, speaker: "user" }];
    pendingNext = undefined;
    phase = "sending";
    error = "";
    render();

    const sid = sessionId;
    saveLocalMessage(sid, { role: "user", content: text, speaker: "user", timestamp: Date.now() });

    const generateAIResponse = async () => {
      try {
        const character = fighter?.id;
        if (!character || !sid) throw new Error("No character selected");

        const ready = await prepareLiveModel(current);
        if (current !== token) return;
        if (!ready) {
          phase = "ready";
          render();
          return;
        }

        // WebLLM requires the last message to be `user` (or tool).
        const memory = loadMemory(character).trim();
        let contextMessages = [
          ...(memory
            ? ([
                { role: "user" as const, content: `Remember this about prior chats:\n${memory}` },
                { role: "assistant" as const, content: "Understood." },
              ] as const)
            : []),
          ...messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content })),
        ];
        contextMessages = capHistory(contextMessages);

        let assistantIndex = -1;
        const aiResponse = await chat(character, contextMessages, {
          onToken: (tokenText) => {
            if (assistantIndex < 0) {
              messages = [...messages, { role: "assistant", content: tokenText, speaker: character }];
              assistantIndex = messages.length - 1;
            } else {
              const next = messages.slice();
              const currentMsg = next[assistantIndex];
              next[assistantIndex] = { ...currentMsg, content: currentMsg.content + tokenText };
              messages = next;
            }
            render();
          },
          onComplete: (fullText) => {
            console.log("AI response complete:", fullText);
          },
          onError: (err) => {
            console.error("AI error:", err);
            phase = "ready";
            error = err.message || "The local model didn't answer. Try sending again.";
            render();
            input.focus();
          },
        });

        if (assistantIndex < 0 && aiResponse) {
          messages = [...messages, { role: "assistant", content: aiResponse, speaker: character }];
        }
        saveLocalMessage(sid, { role: "assistant", content: aiResponse, speaker: character, timestamp: Date.now() });
        setLocalPartner(sid, null);
        phase = "ready";
        render();
        input.focus();
        if (fighter) refreshHistory(fighter, current);
      } catch (err) {
        console.error("AI generation error:", err);
        phase = "ready";
        modelLoading = false;
        error = err instanceof Error ? err.message : "The local model didn't answer. Try sending again.";
        render();
        input.focus();
      }
    };

    void generateAIResponse();
  });

  newBtn.addEventListener("click", () => {
    if (frozenChat || !fighter?.id || phase === "loading" || phase === "greeting" || phase === "sending") return;
    confirm = false;
    sessionId = null;
    messages = [];
    error = "";
    phase = "loading";
    forgetPartner();
    const current = ++token;
    render();
    void load(fighter, true, current);
  });

  deleteBtn.addEventListener("click", () => {
    if (frozenChat || !sessionId) return;
    confirm = true;
    render();
    document.querySelector<HTMLButtonElement>("#chat-confirm-no")!.focus();
  });

  document.querySelector("#chat-confirm-no")!.addEventListener("click", () => {
    confirm = false;
    render();
    input.focus();
  });

  document.querySelector("#chat-confirm-yes")!.addEventListener("click", () => {
    if (!sessionId) return;
    const current = token;
    const id = sessionId;
    deleteBtn.disabled = true;
    try {
      deleteLocalSession(id);
      if (current !== token || !fighter?.id) return;
      confirm = false;
      sessionId = null;
      messages = [];
      error = "";
      phase = "loading";
      forgetPartner();
      const next = ++token;
      render();
      void load(fighter, false, next);
    } catch (err: unknown) {
      if (current !== token) return;
      confirm = false;
      error = err instanceof Error ? err.message : "Couldn't delete that session.";
      render();
    }
  });

  retry.addEventListener("click", () => {
    if (!fighter?.id) return;

    // Model / capability failure while a session exists: retry ensureLLM only.
    if (sessionId && (llmBlocked || !isLLMReady())) {
      llmBlocked = false;
      error = "";
      const current = ++token;
      phase = "ready";
      render();
      void prepareLiveModel(current).then((ok) => {
        if (current !== token) return;
        if (ok) {
          error = "";
          llmBlocked = false;
        }
        render();
        if (ok) input.focus();
      });
      return;
    }

    error = "";
    llmBlocked = false;
    phase = "loading";
    const current = ++token;
    render();
    void load(fighter, false, current);
  });

  document.querySelector("#chat-back")!.addEventListener("click", () => close());

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !confirm) return;
    event.stopPropagation();
    confirm = false;
    render();
    deleteBtn.focus();
  });

  function reelCard(): HTMLElement | null {
    return document.querySelector(".card.is-active");
  }

  function hideReelCharacter(): void {
    reelCard()?.classList.add("is-chatting");
  }

  function showReelCharacter(): void {
    document.querySelectorAll(".card.is-chatting").forEach((card) => {
      card.classList.remove("is-chatting");
    });
  }

  function finishClose(): void {
    root.classList.remove("is-open", "is-leaving");
    root.style.transformOrigin = "";
    root.setAttribute("aria-hidden", "true");
    showReelCharacter();
    opts.onClose();
  }

  function close(): void {
    if (leaving) return;
    token += 1;
    confirm = false;
    if (!root.classList.contains("is-open")) {
      finishClose();
      return;
    }
    if (reducedMotion) {
      finishClose();
      return;
    }
    leaving = true;
    hideReelCharacter();
    const ghost = liftCharacter(root, hero, portrait);
    root.classList.add("is-leaving");
    window.setTimeout(() => {
      ghost?.remove();
      leaving = false;
      finishClose();
    }, LEAVE_MS);
  }

  return {
    isOpen: () => root.classList.contains("is-open"),
    start(person: Fighter) {
      fighter = person;
      partnerId = null;
      error = "";
      confirm = false;
      llmBlocked = false;
      modelLoading = false;
      paintIdentity(person);
      hideReelCharacter();
      if (frozenChat && person.id) {
        const sample = sampleFor(person.id);
        sessionId = sample.session.id;
        messages = sample.messages;
        phase = "ready";
        const title = document.querySelector<HTMLElement>("#chat-history-title");
        if (title) title.textContent = "Sample transcript";
        paintHistory([sample.session]);
        render();
        return;
      }
      sessionId = null;
      messages = [];
      phase = "loading";
      historyNote("Loading sessions…");
      const current = ++token;
      void (async () => {
        error = "Checking device…";
        render();
        deviceAssessment = await assessDevice();
        if (current !== token) return;
        if (deviceAssessment.tier !== "live") {
          // TODO: frozen fallback (right branch)
          llmBlocked = true;
        } else {
          llmBlocked = false;
          console.log(
            "Device live for WebLLM",
            deviceAssessment.adapterInfo || "",
            deviceAssessment.ramUnknown ? "(RAM unknown)" : "",
          );
        }
        await load(person, false, current);
        if (current !== token) return;
        if (llmBlocked) {
          error = deviceAssessment.reason || "This device can't run the local model.";
          render();
        }
      })();
    },
    reveal() {
      root.classList.add("is-open");
      root.setAttribute("aria-hidden", "false");
      render();
      if (phase === "ready" && sessionId && !confirm) input.focus();
    },
    close,
  };
}

type Phase = "loading" | "greeting" | "ready" | "sending";