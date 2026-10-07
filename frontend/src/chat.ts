import { deleteSession, greet, openSession, sendMessage, type ChatMessage } from "./api";
import { STAR_EN, STAR_JA, type Fighter } from "./characters";

type Phase = "loading" | "greeting" | "ready" | "sending";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const LEAVE_MS = 660;

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

  let fighter: Fighter | null = null;
  let sessionId: string | null = null;
  let messages: ChatMessage[] = [];
  let phase: Phase = "ready";
  let error = "";
  let confirm = false;
  let token = 0;
  let leaving = false;

  function icon(person: Fighter, large = false): HTMLElement {
    const el = document.createElement("span");
    el.className = large ? "msg-icon chat-hero-icon" : "msg-icon";
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

  function paintIdentity(person: Fighter): void {
    root.style.setProperty("--aura", person.color);
    hero.replaceChildren(icon(person, true));
    portrait.replaceChildren();
    if (person.image) {
      const img = document.createElement("img");
      img.src = person.image;
      img.alt = "";
      portrait.append(img);
    } else {
      const seal = document.createElement("div");
      seal.className = "seal";
      seal.style.setProperty("--seal", person.color);
      seal.textContent = String(person.stars);
      portrait.append(seal);
    }
    kicker.textContent = person.title
      ? `${STAR_EN[person.stars]} · ${person.title}`
      : STAR_EN[person.stars];
    nameEl.textContent = person.name;
    jaEl.textContent = person.nameJa;
    markEl.textContent = STAR_JA[person.stars]?.slice(0, 1) ?? "";
    input.placeholder = `Say something to ${person.name}…`;
    input.setAttribute("aria-label", `Message to ${person.name}`);
    confirmCopy.textContent = `Delete this session with ${person.name}?`;
  }

  function ki(): HTMLElement {
    const span = document.createElement("span");
    span.className = "ki";
    span.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
    return span;
  }

  function appendMessage(msg: ChatMessage): void {
    if (!fighter) return;
    const row = document.createElement("article");
    row.className = msg.role === "user" ? "msg msg-user" : "msg msg-assistant";
    if (msg.role === "assistant") row.append(icon(fighter));
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    const who = document.createElement("p");
    who.className = "bubble-name";
    who.textContent = msg.role === "user" ? "You" : fighter.name;
    const body = document.createElement("p");
    body.textContent = msg.content;
    bubble.append(who, body);
    row.append(bubble);
    log.append(row);
  }

  function appendPending(): void {
    if (!fighter) return;
    const row = document.createElement("article");
    row.className = "msg msg-assistant";
    row.append(icon(fighter));
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    const who = document.createElement("p");
    who.className = "bubble-name";
    who.textContent = fighter.name;
    const body = document.createElement("p");
    body.className = "bubble-wait";
    if (phase === "loading") {
      body.textContent = "Opening the line…";
    } else {
      body.append(ki());
      const sr = document.createElement("span");
      sr.className = "sr";
      sr.textContent = `Waiting for ${fighter.name}`;
      body.append(sr);
    }
    bubble.append(who, body);
    row.append(bubble);
    log.append(row);
  }

  function render(): void {
    const busy = phase === "loading" || phase === "greeting" || phase === "sending";
    log.replaceChildren();
    if (fighter && messages.length === 0 && phase === "ready" && !error) {
      const empty = document.createElement("p");
      empty.className = "chat-empty";
      empty.textContent = `${fighter.name} is on the line. Say something.`;
      log.append(empty);
    }
    for (const msg of messages) appendMessage(msg);
    if (busy) appendPending();
    log.scrollTop = log.scrollHeight;
    log.setAttribute("aria-busy", busy ? "true" : "false");

    errorText.textContent = error;
    errorBox.hidden = !error;
    retry.hidden = !error || sessionId !== null;
    confirmBox.hidden = !confirm;

    newBtn.disabled = busy || !fighter;
    deleteBtn.disabled = busy || !sessionId;
    sendBtn.disabled = busy || !sessionId || confirm;
    input.disabled = busy || !sessionId || confirm;
  }

  async function load(person: Fighter, fresh: boolean, current: number): Promise<void> {
    if (!person.id) return;
    try {
      const session = await openSession(person.id, fresh);
      if (current !== token) return;
      sessionId = session.id;
      messages = session.messages;
      error = "";
      if (messages.length === 0) {
        phase = "greeting";
        render();
        const greeted = await greet(session.id);
        if (current !== token) return;
        sessionId = greeted.id;
        messages = greeted.messages;
      }
      phase = "ready";
    } catch (err) {
      if (current !== token) return;
      phase = "ready";
      error = err instanceof Error ? err.message : "Something went wrong. Try again.";
    }
    render();
    if (phase === "ready" && sessionId && !confirm) input.focus();
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!fighter || !sessionId || phase !== "ready" || confirm) return;
    const text = input.value.trim();
    if (!text) return;
    const current = token;
    const draft = input.value;
    input.value = "";
    messages = [...messages, { role: "user", content: text }];
    phase = "sending";
    error = "";
    render();
    void sendMessage(sessionId, text)
      .then((session) => {
        if (current !== token) return;
        sessionId = session.id;
        messages = session.messages;
        phase = "ready";
        render();
        input.focus();
      })
      .catch((err: unknown) => {
        if (current !== token) return;
        messages = messages.slice(0, -1);
        input.value = draft;
        phase = "ready";
        error = err instanceof Error ? err.message : "The local model didn't answer. Try sending again.";
        render();
        input.focus();
      });
  });

  newBtn.addEventListener("click", () => {
    if (!fighter?.id || phase === "loading" || phase === "greeting" || phase === "sending") return;
    confirm = false;
    sessionId = null;
    messages = [];
    error = "";
    phase = "loading";
    const current = ++token;
    render();
    void load(fighter, true, current);
  });

  deleteBtn.addEventListener("click", () => {
    if (!sessionId) return;
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
    void deleteSession(id)
      .then(() => {
        if (current !== token) return;
        close();
      })
      .catch((err: unknown) => {
        if (current !== token) return;
        confirm = false;
        error = err instanceof Error ? err.message : "Couldn't delete that session.";
        render();
      });
  });

  retry.addEventListener("click", () => {
    if (!fighter?.id) return;
    error = "";
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

  function liftCharacter(): HTMLElement | null {
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
    const ghost = liftCharacter();
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
      sessionId = null;
      messages = [];
      error = "";
      confirm = false;
      phase = "loading";
      paintIdentity(person);
      hideReelCharacter();
      const current = ++token;
      void load(person, false, current);
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
