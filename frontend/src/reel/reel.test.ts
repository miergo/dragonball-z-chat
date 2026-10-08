type Listener = (event: Record<string, unknown>) => void;

type TestEl = {
  tagName: string;
  id: string;
  className: string;
  textContent: string;
  textWrites: number;
  htmlWrites: number;
  src: string;
  srcWrites: number;
  type: string;
  hidden: boolean;
  disabled: boolean;
  value: string;
  placeholder: string;
  alt: string;
  dataset: Record<string, string>;
  attrs: Record<string, string>;
  children: TestEl[];
  parent: TestEl | null;
  offsetWidth: number;
  scrollTop: number;
  scrollHeight: number;
  style: { setProperty(name: string, value: string): void; transform: string } & Record<string, string>;
  classList: {
    add(token: string): void;
    remove(...tokens: string[]): void;
    toggle(token: string, force?: boolean): boolean;
    contains(token: string): boolean;
  };
  listeners: Record<string, Listener[]>;
  innerHTML: string;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  toggleAttribute(name: string, force?: boolean): boolean;
  append(...nodes: TestEl[]): void;
  replaceChildren(...nodes: TestEl[]): void;
  remove(): void;
  focus(): void;
  setPointerCapture(): void;
  addEventListener(type: string, handler: Listener): void;
  querySelector(sel: string): TestEl | null;
  querySelectorAll(sel: string): TestEl[];
  closest(sel: string): TestEl | null;
};

const pending = new Map<number, FrameRequestCallback>();
let scheduled = 0;

function classes(el: TestEl): string[] {
  return el.className.split(/\s+/).filter(Boolean);
}

function matches(el: TestEl, sel: string): boolean {
  const parts = sel.split(/(?=[.#])/).filter(Boolean);
  return parts.every((part) => {
    if (part.startsWith("#")) return el.id === part.slice(1);
    if (part.startsWith(".")) return classes(el).includes(part.slice(1));
    return el.tagName.toLowerCase() === part.toLowerCase();
  });
}

function walk(el: TestEl, sel: string, out: TestEl[]): void {
  const steps = sel.trim().split(/\s+/);
  const head = steps[0];
  const tail = steps.slice(1).join(" ");
  for (const kid of el.children) {
    if (matches(kid, head)) {
      if (!tail) out.push(kid);
      else walk(kid, tail, out);
    }
    if (!tail) walk(kid, head, out);
    else if (!matches(kid, head)) walk(kid, sel, out);
  }
}

function create(tag: string): TestEl {
  const el = {
    tagName: tag.toUpperCase(),
    id: "",
    className: "",
    textWrites: 0,
    htmlWrites: 0,
    src: "",
    srcWrites: 0,
    type: "",
    hidden: false,
    disabled: false,
    value: "",
    placeholder: "",
    alt: "",
    dataset: {},
    attrs: {},
    children: [],
    parent: null,
    offsetWidth: 240,
    scrollTop: 0,
    scrollHeight: 0,
    listeners: {},
  } as unknown as TestEl;
  let text = "";
  Object.defineProperty(el, "textContent", {
    get() {
      return text;
    },
    set(value: string) {
      el.textWrites += 1;
      text = value == null ? "" : String(value);
    },
  });
  const style = {
    setProperty(name: string, value: string) {
      style[name] = value;
    },
    transform: "",
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
    toggle(token: string, force?: boolean) {
      const has = classes(el).includes(token);
      const on = force === undefined ? !has : force;
      if (on) el.classList.add(token);
      else el.classList.remove(token);
      return on;
    },
    contains(token: string) {
      return classes(el).includes(token);
    },
  };
  el.setAttribute = (name: string, value: string) => {
    el.attrs[name] = value;
  };
  el.removeAttribute = (name: string) => {
    delete el.attrs[name];
  };
  el.toggleAttribute = (name: string, force?: boolean) => {
    const has = Object.prototype.hasOwnProperty.call(el.attrs, name);
    const on = force === undefined ? !has : force;
    if (on) el.attrs[name] = "";
    else delete el.attrs[name];
    return on;
  };
  el.append = (...nodes: TestEl[]) => {
    for (const node of nodes) {
      node.parent = el;
      el.children.push(node);
    }
  };
  el.replaceChildren = (...nodes: TestEl[]) => {
    el.children.length = 0;
    el.append(...nodes);
  };
  el.remove = () => {
    if (!el.parent) return;
    el.parent.children = el.parent.children.filter((kid) => kid !== el);
    el.parent = null;
  };
  el.focus = () => {};
  el.setPointerCapture = () => {};
  el.addEventListener = (type: string, handler: Listener) => {
    (el.listeners[type] ??= []).push(handler);
  };
  el.querySelector = (sel: string) => {
    const out: TestEl[] = [];
    walk(el, sel, out);
    return out[0] ?? null;
  };
  el.querySelectorAll = (sel: string) => {
    const out: TestEl[] = [];
    walk(el, sel, out);
    return out;
  };
  el.closest = (sel: string) => {
    let cur: TestEl | null = el;
    while (cur) {
      if (matches(cur, sel)) return cur;
      cur = cur.parent;
    }
    return null;
  };
  Object.defineProperty(el, "src", {
    get() {
      return (el as { _src?: string })._src ?? "";
    },
    set(value: string) {
      el.srcWrites += 1;
      (el as { _src?: string })._src = value;
    },
  });
  Object.defineProperty(el, "innerHTML", {
    get() {
      return "";
    },
    set(html: string) {
      el.htmlWrites += 1;
      el.children.length = 0;
      parse(html, el);
    },
  });
  return el;
}

function parse(html: string, parent: TestEl): void {
  const re = /<\/([a-zA-Z0-9]+)>|<([a-zA-Z0-9]+)([^>]*?)(\/?)>/g;
  const stack: TestEl[] = [parent];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    if (match[1]) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const tag = match[2].toLowerCase();
    const attrs = match[3];
    const el = create(tag);
    const className = /class="([^"]*)"/.exec(attrs);
    if (className) el.className = className[1];
    const id = /id="([^"]*)"/.exec(attrs);
    if (id) el.id = id[1];
    const src = /src="([^"]*)"/.exec(attrs);
    if (src) el.src = src[1];
    stack[stack.length - 1].append(el);
    const self = match[4] === "/" || tag === "img" || tag === "i" || tag === "br" || tag === "input";
    if (!self) stack.push(el);
  }
}

function installDom(): TestEl {
  const root = create("div");
  const ids = [
    "reel",
    "plate-index",
    "plate-name",
    "plate-ja",
    "plate-line",
    "site",
    "summon",
    "prev",
    "next",
    "summon-figure",
    "summon-name",
    "summon-ja",
    "summon-line",
    "summon-chat",
    "summon-close",
    "splash",
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
  ];
  for (const id of ids) {
    const node = create("div");
    node.id = id;
    root.append(node);
  }
  const kicker = create("p");
  kicker.className = "summon-kicker";
  root.append(kicker);
  const vert = create("p");
  vert.className = "summon-vert";
  root.append(vert);

  const listeners: Record<string, Listener[]> = {};
  const win = globalThis as typeof globalThis & Window & { document: Document };
  win.window = win;
  win.matchMedia = (() => ({ matches: true })) as unknown as Window["matchMedia"];
  win.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    scheduled += 1;
    pending.set(scheduled, cb);
    return scheduled;
  }) as unknown as Window["requestAnimationFrame"];
  win.cancelAnimationFrame = ((id: number) => {
    pending.delete(id);
  }) as unknown as Window["cancelAnimationFrame"];
  win.addEventListener = ((type: string, handler: Listener) => {
    (listeners[type] ??= []).push(handler);
  }) as unknown as Window["addEventListener"];
  win.document = {
    hidden: false,
    body: create("body"),
    createElement(tag: string) {
      return create(tag) as unknown as HTMLElement;
    },
    querySelector(sel: string) {
      return root.querySelector(sel) as unknown as HTMLElement | null;
    },
    querySelectorAll(sel: string) {
      return root.querySelectorAll(sel) as unknown as NodeListOf<Element>;
    },
    addEventListener(type: string, handler: Listener) {
      (listeners[`document:${type}`] ??= []).push(handler);
    },
  } as unknown as Document;
  (win.document as unknown as { fire(type: string): void }).fire = (type: string) => {
    for (const handler of listeners[`document:${type}`] ?? []) handler({});
  };
  return root;
}

function writes(el: TestEl): number {
  let count = el.textWrites + el.htmlWrites + el.srcWrites;
  for (const kid of el.children) count += writes(kid);
  return count;
}

function fire(el: TestEl, type: string, event: Record<string, unknown>): void {
  for (const handler of el.listeners[type] ?? []) handler(event);
}

function pump(): void {
  const batch = [...pending.entries()];
  pending.clear();
  for (const [, cb] of batch) cb(performance.now());
}

const failures: string[] = [];

function check(cond: unknown, message: string): void {
  if (!cond) failures.push(message);
}

const root = installDom();
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
  if ((ms ?? 0) >= 400) return 0 as unknown as ReturnType<typeof setTimeout>;
  return realSetTimeout(fn as never, ms, ...args);
}) as typeof setTimeout;
globalThis.fetch = (() => new Promise(() => {})) as typeof fetch;

try {
  await import("../main");
} finally {
  globalThis.setTimeout = realSetTimeout;
}

const doc = document as Document & { hidden: boolean; fire(type: string): void };
const reel = root.querySelector("#reel");
const chat = root.querySelector("#chat");
const plateName = root.querySelector("#plate-name");
if (!reel || !chat || !plateName) throw new Error("reel mounted");

check(pending.size === 1, "ball loop starts while the reel is visible");
const runningId = [...pending.keys()][0];
pump();
check(pending.size === 1 && !pending.has(runningId), "ball loop keeps scheduling while the reel is visible");

const beforeHide = scheduled;
doc.hidden = true;
doc.fire("visibilitychange");
check(pending.size === 0, "tick loop pauses while the tab is hidden");
doc.hidden = false;
doc.fire("visibilitychange");
check(scheduled > beforeHide && pending.size === 1, "tick loop starts again when the tab is visible");

const beforeChat = scheduled;
const summonChat = root.querySelector("#summon-chat");
if (!summonChat) throw new Error("summon chat button");
fire(summonChat, "click", {});
check(chat.classList.contains("is-open"), "chat covers the reel");
check(pending.size === 0, "tick loop pauses while chat covers the reel");
doc.hidden = false;
doc.fire("visibilitychange");
check(pending.size === 0, "tick loop stays paused while chat still covers the reel");
const back = root.querySelector("#chat-back");
if (!back) throw new Error("chat back button");
fire(back, "click", {});
check(!chat.classList.contains("is-open"), "chat closed");
check(scheduled > beforeChat && pending.size === 1, "tick loop starts again when the reel is visible");
doc.hidden = true;
doc.fire("visibilitychange");
check(pending.size === 0, "tick loop pauses again while the tab is hidden");
fire(summonChat, "click", {});
fire(back, "click", {});
check(!chat.classList.contains("is-open") && pending.size === 0, "closing chat in a hidden tab leaves the loop paused");
doc.hidden = false;
doc.fire("visibilitychange");
check(pending.size === 1, "tick loop starts when the tab is visible and chat is closed");

const cards = reel.querySelectorAll(".card");
const card = cards[0];
const position = card.style.transform;
const cardWrites = cards.map((item) => writes(item));
const nameWrites = plateName.textWrites;
const jaWrites = root.querySelector("#plate-ja")!.textWrites;
const lineWrites = root.querySelector("#plate-line")!.textWrites;
fire(reel, "pointerdown", { button: 0, clientX: 0, pointerId: 3, target: card });
fire(reel, "pointermove", { button: 0, clientX: -180, pointerId: 3, target: card });
check(card.style.transform !== position, "pointer move updates card position");
check(
  cards.every((item, index) => writes(item) === cardWrites[index]),
  "pointer move rewrote a card's text or image",
);
check(
  plateName.textWrites === nameWrites &&
    root.querySelector("#plate-ja")!.textWrites === jaWrites &&
    root.querySelector("#plate-line")!.textWrites === lineWrites,
  "pointer move rewrote the fighter name, kana, or line",
);
fire(reel, "pointerup", { button: 0, clientX: -180, pointerId: 3, target: card });
check(plateName.textContent === "Coming soon", "releasing a drag updates the plate for the card in front");

if (failures.length) throw new Error(failures.join("\n"));

export {};
