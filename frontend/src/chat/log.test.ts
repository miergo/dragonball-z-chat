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
  replaces: number;
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

type LiveStream = {
  push(chunk: string): void;
  close(): void;
};

type Call = {
  url: string;
  resolve(body: unknown, status?: number): void;
  reject(err: unknown): void;
  stream(): LiveStream;
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

function hasClass(el: TestEl, name: string): boolean {
  return classes(el).includes(name);
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
    replaces: 0,
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
    el.replaces += 1;
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

function installFetch(): void {
  calls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    return await new Promise<Response>((resolveResponse, reject) => {
      calls.push({
        url,
        resolve(body, status = 200) {
          resolveResponse(
            new Response(JSON.stringify(body), {
              status,
              headers: { "Content-Type": "application/json" },
            }),
          );
        },
        reject,
        stream() {
          const encoder = new TextEncoder();
          let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
          const body = new ReadableStream<Uint8Array>({
            start(ctrl) {
              controller = ctrl;
            },
          });
          resolveResponse(
            new Response(body, {
              status: 200,
              headers: { "Content-Type": "text/event-stream" },
            }),
          );
          return {
            push(chunk: string) {
              controller?.enqueue(encoder.encode(chunk));
            },
            close() {
              controller?.close();
            },
          };
        },
      });
    });
  }) as typeof fetch;
}

function sse(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function lastCall(): Call {
  const call = calls[calls.length - 1];
  if (!call) throw new Error("expected a fetch");
  return call;
}

function byId(id: string): TestEl {
  const el = document.querySelector(`#${id}`) as unknown as TestEl | null;
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

function fire(id: string, type: string): void {
  const el = byId(id);
  const event = { preventDefault() {}, stopPropagation() {}, key: "" };
  for (const handler of el.listeners[type] ?? []) handler(event);
}

function walk(node: TestEl, visit: (node: TestEl) => boolean | void): void {
  if (visit(node) === false) return;
  node.children.forEach((child) => walk(child, visit));
}

function isPending(row: TestEl): boolean {
  let found = false;
  walk(row, (node) => {
    if (hasClass(node, "bubble-wait") || hasClass(node, "msg-pending")) found = true;
  });
  return found;
}

function messageRows(): TestEl[] {
  return byId("chat-log").children.filter((child) => hasClass(child, "msg") && !isPending(child));
}

function pendingRow(): TestEl | undefined {
  return byId("chat-log").children.find((child) => hasClass(child, "msg") && isPending(child));
}

function nameText(row: TestEl): string {
  let name = "";
  walk(row, (node) => {
    if (hasClass(node, "bubble-name")) name = node.textContent;
  });
  return name;
}

function bodyText(row: TestEl): string {
  const parts: string[] = [];
  walk(row, (node) => {
    if (hasClass(node, "bubble-name") || hasClass(node, "msg-icon")) return false;
    if (node.textContent) parts.push(node.textContent);
  });
  return parts.join(" ");
}

function session(id: string, messages: Session["messages"]): Session {
  return { id, character: "goku", messages };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const previousFetch = globalThis.fetch;
installFetch();
installDom();

const { createChat } = await import("./chat");

function mount(): ReturnType<typeof createChat> {
  installDom();
  return createChat({ onClose() {} });
}

const opened = mount();
opened.start(goku);
const openCall = lastCall();
openCall.resolve(
  session("live", [
    { role: "user", content: "hey" },
    { role: "assistant", content: "yo" },
  ]),
);
await flush();

const log = byId("chat-log");
const first = messageRows()[0];
const second = messageRows()[1];
check(Boolean(first && second), "the first load paints each message");
check(bodyText(first).includes("hey") && bodyText(second).includes("yo"), "the first load shows the session text");
const painted = log.replaces;

fire("chat-delete", "click");
check(byId("chat-confirm").hidden === false, "delete opens the confirm control");
check(messageRows()[0] === first && messageRows()[1] === second, "confirm keeps the existing bubbles");
check(log.replaces === painted, "confirm does not rebuild the log");
fire("chat-confirm-no", "click");
check(byId("chat-confirm").hidden === true, "keeping the session hides confirm");
check(messageRows()[0] === first && messageRows()[1] === second, "closing confirm keeps the existing bubbles");
check(log.replaces === painted, "closing confirm does not rebuild the log");

byId("chat-input").value = "again";
fire("chat-form", "submit");
check(messageRows()[0] === first && messageRows()[1] === second, "sending keeps the existing bubbles");
check(messageRows().length === 3 && bodyText(messageRows()[2]).includes("again"), "sending appends the user bubble");
check(Boolean(pendingRow()), "sending shows the pending row");
check(log.replaces === painted, "sending does not rebuild the log");

const sent = lastCall();
sent.resolve(
  session("live", [
    { role: "user", content: "hey" },
    { role: "assistant", content: "yo" },
    { role: "user", content: "again" },
    { role: "assistant", content: "reply" },
  ]),
);
await flush();
check(messageRows()[0] === first && messageRows()[1] === second, "a matching tail keeps the existing bubbles");
check(messageRows().length === 4 && bodyText(messageRows()[3]).includes("reply"), "a matching tail appends the reply");
check(!pendingRow(), "a finished send removes the pending row");
check(log.replaces === painted, "a matching tail does not rebuild the log");

const reverted = mount();
reverted.start(goku);
lastCall().resolve(
  session("live", [
    { role: "user", content: "hey" },
    { role: "assistant", content: "yo" },
  ]),
);
await flush();
const kept = messageRows()[0];
byId("chat-input").value = "again";
fire("chat-form", "submit");
lastCall().reject(new Error("nope"));
await flush();
check(!messageRows().includes(kept), "a rejected send rebuilds when the optimistic message is dropped");
check(
  messageRows().length === 2 && bodyText(messageRows()[0]).includes("hey") && bodyText(messageRows()[1]).includes("yo"),
  "a rejected send restores the previous messages",
);
check(!messageRows().some((row) => bodyText(row).includes("again")), "a rejected send drops the unsent bubble");
check(byId("chat-input").value === "again", "a rejected send restores the draft");
check(byId("chat-error").hidden === false, "a rejected send shows the error");

const reloaded = mount();
reloaded.start(goku);
lastCall().resolve(
  session("live", [
    { role: "user", content: "hey" },
    { role: "assistant", content: "yo" },
  ]),
);
await flush();
const stale = messageRows()[0];
const beforeRetry = byId("chat-log").replaces;
fire("chat-retry", "click");
check(messageRows()[0] === stale, "retry keeps the bubbles while the next session loads");
check(Boolean(pendingRow()) && bodyText(pendingRow()!).includes("Opening the line"), "retry updates the pending row");
check(byId("chat-log").replaces === beforeRetry, "retry does not rebuild the log");
lastCall().resolve(session("live", [{ role: "assistant", content: "different history" }]));
await flush();
check(!messageRows().includes(stale), "a different history rebuilds the log");
check(messageRows().length === 1 && bodyText(messageRows()[0]).includes("different history"), "a rebuilt log shows the new history");

const greeting = mount();
greeting.start(goku);
greeting.reveal();
const loadingRow = pendingRow();
check(Boolean(loadingRow) && bodyText(loadingRow!).includes("Opening the line"), "the first paint shows the loading row");
const loadingReplaces = byId("chat-log").replaces;
lastCall().resolve(session("empty", []));
await flush();
const waitingRow = pendingRow();
check(waitingRow === loadingRow, "a phase change updates the pending row in place");
check(Boolean(waitingRow) && bodyText(waitingRow!).includes("Waiting for Goku"), "greeting replaces the loading copy");
check(!bodyText(waitingRow!).includes("Opening the line"), "greeting clears the loading copy");
check(byId("chat-log").replaces === loadingReplaces, "a phase change does not rebuild the log");
const greetCall = lastCall();
check(greetCall.url.includes("/greet"), "an empty session still greets");
greetCall.resolve(session("empty", [{ role: "assistant", content: "hello" }]));
await flush();
check(!pendingRow(), "the greeting removes the pending row");
check(messageRows().length === 1 && bodyText(messageRows()[0]).includes("hello"), "the greeting appends its message");
check(byId("chat-log").replaces === loadingReplaces, "the greeting tail does not rebuild the log");

const streamed = mount();
streamed.start(goku);
lastCall().resolve(
  session("live", [
    { role: "user", content: "hey" },
    { role: "assistant", content: "yo" },
  ]),
);
await flush();
const keptRows = messageRows();
byId("chat-input").value = "again";
fire("chat-form", "submit");
const live = lastCall().stream();
live.push(
  sse({
    type: "line",
    message: { role: "assistant", content: "One.", speaker: "piccolo" },
    partner: "piccolo",
    next: "frieza",
  }),
);
await flush();
check(messageRows()[0] === keptRows[0] && messageRows()[1] === keptRows[1], "a streamed line keeps the earlier bubbles");
check(messageRows().length === 4 && bodyText(messageRows()[3]).includes("One."), "a streamed line paints before the turn finishes");
check(Boolean(pendingRow()) && nameText(pendingRow()!).includes("Frieza"), "the waiting bubble moves to the next fighter");
live.push(
  sse({
    type: "line",
    message: { role: "assistant", content: "Two.", speaker: "frieza" },
    partner: "piccolo",
    next: null,
  }) + sse({ type: "done", partner: "piccolo" }),
);
live.close();
await flush();
check(messageRows().length === 5 && bodyText(messageRows()[4]).includes("Two."), "the next streamed line paints when it arrives");
check(!pendingRow(), "the last streamed line clears the waiting bubble");
check(byId("chat-input").value === "", "a finished stream leaves the draft empty");

const interrupted = mount();
interrupted.start(goku);
lastCall().resolve(
  session("live", [
    { role: "user", content: "hey" },
    { role: "assistant", content: "yo" },
  ]),
);
await flush();
byId("chat-input").value = "again";
fire("chat-form", "submit");
const broken = lastCall().stream();
broken.push(
  sse({
    type: "line",
    message: { role: "assistant", content: "Kept.", speaker: "piccolo" },
    partner: "piccolo",
    next: "frieza",
  }),
);
await flush();
broken.push(sse({ type: "error", detail: "The local model didn't answer." }));
broken.close();
await flush();
check(bodyText(messageRows()[messageRows().length - 1]).includes("Kept."), "a later failure keeps the lines already painted");
check(
  messageRows().some((row) => bodyText(row).includes("again")),
  "a later failure keeps the user line",
);
check(byId("chat-input").value === "", "a later failure does not restore the draft");
check(byId("chat-error").hidden === false, "a later failure shows the error");

const fresh = mount();
fresh.start(goku);
lastCall().resolve(session("empty", []));
await flush();
lastCall().resolve(session("empty", []));
await flush();
const empty = byId("chat-log").children.find((child) => hasClass(child, "chat-empty"));
check(Boolean(empty) && empty!.textContent.includes("Goku is on the line"), "an empty ready session shows the empty line");

globalThis.fetch = previousFetch;
if (failures.length) throw new Error(failures.join("\n"));

export {};
