import { ApiError, greet, openSession, sendMessage } from "../api/api";
import type { Fighter } from "../characters/characters";
import type { Session } from "../api/api";

type Handler = (event: { preventDefault(): void; stopPropagation(): void; key: string }) => void;

type TestEl = {
  id: string;
  className: string;
  textContent: string;
  value: string;
  placeholder: string;
  hidden: boolean;
  disabled: boolean;
  src: string;
  alt: string;
  children: TestEl[];
  parent: TestEl | null;
  style: { setProperty(name: string, value: string): void } & Record<string, string>;
  classList: {
    add(token: string): void;
    remove(...tokens: string[]): void;
    contains(token: string): boolean;
  };
  attrs: Record<string, string>;
  listeners: Record<string, Handler[]>;
  setAttribute(name: string, value: string): void;
  append(...nodes: TestEl[]): void;
  replaceChildren(...nodes: TestEl[]): void;
  remove(): void;
  addEventListener(type: string, handler: Handler): void;
  focus(): void;
  scrollTop: number;
  scrollHeight: number;
};

type Call = {
  url: string;
  signal?: AbortSignal;
  resolve(body: unknown, status?: number): void;
  reject(err: unknown): void;
};

const goku: Fighter = {
  id: "goku",
  stars: 4,
  name: "Goku",
  nameJa: "悟空",
  title: "Saiyan",
  line: "On the line.",
  color: "#f80",
  image: "/goku.png",
};

const failures: string[] = [];
const calls: Call[] = [];

function check(cond: unknown, message: string): void {
  if (!cond) failures.push(message);
}

function classes(el: TestEl): string[] {
  return el.className.split(/\s+/).filter(Boolean);
}

function create(tag: string): TestEl {
  const el = {
    id: "",
    className: "",
    textContent: "",
    value: "",
    placeholder: "",
    hidden: false,
    disabled: false,
    src: "",
    alt: "",
    children: [],
    parent: null,
    attrs: {},
    listeners: {},
    scrollTop: 0,
    scrollHeight: 0,
  } as unknown as TestEl;
  const style = {
    setProperty(name: string, value: string) {
      style[name] = value;
    },
  } as TestEl["style"];
  el.style = style;
  el.classList = {
    add(token: string) {
      const parts = classes(el);
      if (!parts.includes(token)) parts.push(token);
      el.className = parts.join(" ");
    },
    remove(...tokens: string[]) {
      el.className = classes(el).filter((part) => !tokens.includes(part)).join(" ");
    },
    contains(token: string) {
      return classes(el).includes(token);
    },
  };
  el.setAttribute = (name, value) => {
    el.attrs[name] = value;
  };
  el.append = (...nodes) => {
    for (const node of nodes) {
      node.remove();
      node.parent = el;
      el.children.push(node);
    }
  };
  el.replaceChildren = (...nodes) => {
    for (const child of el.children) child.parent = null;
    el.children.splice(0, el.children.length);
    if (nodes.length) el.append(...nodes);
  };
  el.remove = () => {
    const parent = el.parent;
    if (!parent) return;
    const index = parent.children.indexOf(el);
    if (index >= 0) parent.children.splice(index, 1);
    el.parent = null;
  };
  el.addEventListener = (type, handler) => {
    (el.listeners[type] ??= []).push(handler);
  };
  el.focus = () => {};
  void tag;
  return el;
}

function installDom(): void {
  const root = create("div");
  for (const id of [
    "chat",
    "chat-hero",
    "chat-portrait",
    "chat-kicker",
    "chat-name",
    "chat-ja",
    "chat-mark",
    "chat-log",
    "chat-error",
    "chat-error-text",
    "chat-retry",
    "chat-confirm",
    "chat-confirm-copy",
    "chat-form",
    "chat-input",
    "chat-send",
    "chat-new",
    "chat-delete",
    "chat-confirm-no",
    "chat-confirm-yes",
    "chat-history",
    "chat-back",
  ]) {
    const node = create("div");
    node.id = id;
    root.children.push(node);
  }
  const win = globalThis as typeof globalThis & Window;
  win.window = win;
  win.matchMedia = (() => ({ matches: false })) as unknown as Window["matchMedia"];
  globalThis.document = {
    createElement() {
      return create("div") as unknown as HTMLElement;
    },
    querySelector(sel: string) {
      const id = sel.startsWith("#") ? sel.slice(1) : sel;
      return (root.children.find((node) => node.id === id) ?? null) as unknown as HTMLElement | null;
    },
    querySelectorAll() {
      return [] as unknown as NodeListOf<Element>;
    },
  } as unknown as Document;
}

function session(id: string, content: string): Session {
  return {
    id,
    character: "goku",
    messages: content ? [{ role: "assistant", content }] : [],
  };
}

function installFetch(): void {
  calls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const signal = init?.signal ?? undefined;
    return await new Promise<Response>((resolve, reject) => {
      calls.push({
        url,
        signal,
        resolve(body, status = 200) {
          resolve(
            new Response(JSON.stringify(body), {
              status,
              headers: { "Content-Type": "application/json" },
            }),
          );
        },
        reject,
      });
    });
  }) as typeof fetch;
}

function lastCall(): Call {
  const call = calls[calls.length - 1];
  if (!call) throw new Error("expected a fetch");
  return call;
}

function fire(id: string, type: string): void {
  const el = document.querySelector(`#${id}`) as unknown as TestEl | null;
  if (!el) throw new Error(`missing #${id}`);
  const event = { preventDefault() {}, stopPropagation() {}, key: "" };
  for (const handler of el.listeners[type] ?? []) handler(event);
}

function logText(): string {
  const log = document.querySelector("#chat-log") as unknown as TestEl | null;
  if (!log) return "";
  const parts: string[] = [];
  const walk = (node: TestEl) => {
    if (node.textContent) parts.push(node.textContent);
    node.children.forEach(walk);
  };
  walk(log);
  return parts.join(" ");
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const previousFetch = globalThis.fetch;
installFetch();

const openSignal = new AbortController().signal;
const opened = openSession("goku", false, openSignal);
const openCall = lastCall();
check(openCall.signal === openSignal, "request accepts an AbortSignal for openSession");
check(openCall.url === "/api/sessions?fresh=false", "openSession still requests a session");
openCall.resolve({
  id: "s-full",
  character: "goku",
  messages: [
    { role: "user", content: "hey" },
    { role: "assistant", content: "yo" },
  ],
});
const full = await opened;
check(full.id === "s-full" && full.character === "goku", "request parses the session id and character");
check(
  full.messages.length === 2 && full.messages[0].content === "hey" && full.messages[1].content === "yo",
  "request parses the full message list",
);

const greetSignal = new AbortController().signal;
const greeted = greet("s-full", greetSignal);
const greetCall = lastCall();
check(greetCall.signal === greetSignal, "request accepts an AbortSignal for greet");
greetCall.resolve(session("s-full", "hello"));
const greetSession = await greeted;
check(greetSession.messages[0]?.content === "hello", "greet still parses a full session");

const sendSignal = new AbortController().signal;
const sent = sendMessage("s-full", "hey", sendSignal);
const sendCall = lastCall();
check(sendCall.signal === sendSignal, "request accepts an AbortSignal for send");
check(sendCall.url === "/api/sessions/s-full/messages", "send still posts the message");
sendCall.resolve(session("s-full", "reply"));
const sentSession = await sent;
check(sentSession.id === "s-full" && sentSession.messages[0]?.content === "reply", "send still parses a full session");

const abortController = new AbortController();
const aborted = greet("s-full", abortController.signal);
const abortCall = lastCall();
abortCall.reject(new DOMException("The operation was aborted.", "AbortError"));
const abortErr = await aborted.then(
  () => null,
  (err: unknown) => err,
);
check(abortErr instanceof Error && abortErr.name === "AbortError", "an aborted fetch is not parsed as a session");
check(!(abortErr instanceof ApiError), "an aborted fetch is not reported as an API outage");

installDom();
const { createChat } = await import("./chat");

function mount(): ReturnType<typeof createChat> {
  installDom();
  return createChat({ onClose() {} });
}

const reopened = mount();
reopened.start(goku);
const reopenFirst = lastCall();
reopened.close();
reopened.start(goku);
const reopenSecond = lastCall();
check(Boolean(reopenFirst.signal?.aborted), "reopening chat aborts the previous fetch");
reopenFirst.resolve(session("old", "OLD REPLY"));
reopenSecond.resolve(session("new", "CURRENT REPLY"));
await flush();
check(logText().includes("CURRENT REPLY"), "reopening chat shows the new session");
check(!logText().includes("OLD REPLY"), "reopening chat ignores the previous reply");

const retried = mount();
retried.start(goku);
const retryFirst = lastCall();
fire("chat-retry", "click");
const retrySecond = lastCall();
check(Boolean(retryFirst.signal?.aborted), "retry aborts the previous fetch");
retryFirst.resolve(session("old", "STALE RETRY"));
retrySecond.resolve(session("new", "FRESH RETRY"));
await flush();
check(logText().includes("FRESH RETRY"), "retry shows the latest session");
check(!logText().includes("STALE RETRY"), "retry ignores the previous reply");

const renewed = mount();
renewed.start(goku);
const renewOpen = lastCall();
renewOpen.resolve(session("kept", "KEEP THIS"));
await flush();
fire("chat-new", "click");
const renewFresh = lastCall();
check(Boolean(renewOpen.signal?.aborted), "a new session aborts the previous fetch");
check(renewFresh.url.includes("fresh=true"), "a new session requests a fresh session");
renewFresh.resolve(session("fresh", "NEW SESSION"));
await flush();
check(logText().includes("NEW SESSION"), "a new session shows its own reply");
check(!logText().includes("KEEP THIS"), "a new session drops the previous reply");

const greetedChat = mount();
greetedChat.start(goku);
const greetOpen = lastCall();
greetOpen.resolve(session("empty", ""));
await flush();
const greetFlight = lastCall();
check(Boolean(greetOpen.signal?.aborted), "a new greet aborts the previous fetch");
check(greetFlight.url.includes("/greet"), "an empty session still greets");
greetedChat.start(goku);
check(Boolean(greetFlight.signal?.aborted), "a session start aborts the in-flight greet");
greetFlight.resolve(session("empty", "OLD GREET"));
const greetNext = lastCall();
greetNext.resolve(session("next", "NEW LINE"));
await flush();
check(logText().includes("NEW LINE"), "session start shows the new line");
check(!logText().includes("OLD GREET"), "session start ignores the previous greet");

const sentChat = mount();
sentChat.start(goku);
const sendOpen = lastCall();
sendOpen.resolve(session("live", "hello"));
await flush();
(document.querySelector("#chat-input") as unknown as TestEl).value = "hey";
fire("chat-form", "submit");
const sendFlight = lastCall();
check(Boolean(sendOpen.signal?.aborted), "send aborts the previous fetch");
check(sendFlight.url.endsWith("/messages"), "send posts to the session");
sentChat.close();
sentChat.start(goku);
check(Boolean(sendFlight.signal?.aborted), "reopening chat aborts the in-flight send");
sendFlight.resolve({
  id: "live",
  character: "goku",
  messages: [
    { role: "user", content: "hey" },
    { role: "assistant", content: "STALE SEND" },
  ],
});
const sendNext = lastCall();
sendNext.resolve(session("after", "AFTER SEND"));
await flush();
check(logText().includes("AFTER SEND"), "reopening after a send shows the new session");
check(!logText().includes("STALE SEND"), "reopening after a send ignores the previous reply");

globalThis.fetch = previousFetch;
if (failures.length) throw new Error(failures.join("\n"));

export {};
