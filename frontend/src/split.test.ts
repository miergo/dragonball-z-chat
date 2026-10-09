import type { ReelState } from "./reel/reel";

type Listener = (event: Record<string, unknown>) => void;

type TestEl = {
  tagName: string;
  id: string;
  className: string;
  textContent: string;
  type: string;
  hidden: boolean;
  disabled: boolean;
  src: string;
  alt: string;
  dataset: Record<string, string>;
  attrs: Record<string, string>;
  children: TestEl[];
  parent: TestEl | null;
  offsetWidth: number;
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
    stack[stack.length - 1].append(el);
    const self = match[4] === "/" || tag === "img" || tag === "i" || tag === "br" || tag === "input";
    if (!self) stack.push(el);
  }
}

function create(tag: string): TestEl {
  const el = {
    tagName: tag.toUpperCase(),
    id: "",
    className: "",
    textContent: "",
    type: "",
    hidden: false,
    disabled: false,
    src: "",
    alt: "",
    dataset: {},
    attrs: {},
    children: [],
    parent: null,
    offsetWidth: 240,
    listeners: {},
  } as unknown as TestEl;
  let text = "";
  Object.defineProperty(el, "textContent", {
    get() {
      return text;
    },
    set(value: string) {
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
  Object.defineProperty(el, "innerHTML", {
    get() {
      return "";
    },
    set(html: string) {
      el.children.length = 0;
      parse(html, el);
    },
  });
  return el;
}

function installDom(): TestEl {
  const root = create("div");
  for (const id of [
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
  ]) {
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

  const win = globalThis as typeof globalThis & Window;
  win.window = win;
  win.matchMedia = (() => ({ matches: true })) as unknown as Window["matchMedia"];
  win.addEventListener = () => {};
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
    addEventListener() {},
  } as unknown as Document;
  return root;
}

function fire(el: TestEl, type: string, event: Record<string, unknown>): void {
  for (const handler of el.listeners[type] ?? []) handler(event);
}

const failures: string[] = [];

function check(cond: unknown, message: string): void {
  if (!cond) failures.push(message);
}

const root = installDom();
const { fighters } = await import("./characters/characters");
const { createReel } = await import("./reel/reel");
const { createSummon } = await import("./summon/summon");
const { createSplash } = await import("./splash/splash");

const state: ReelState = {
  index: 0,
  drag: 0,
  balls: [],
  summonOpen: false,
};

const summon = createSummon(state, {
  chat: {
    start() {},
    reveal() {},
    isOpen: () => false,
  },
  stopReel() {},
  focusCard() {},
});

createReel(state, {
  blocked: () => state.summonOpen || summon.busy(),
  openSummon: (index) => summon.open(index),
  chatOpen: () => false,
});

const reel = root.querySelector("#reel");
const plateName = root.querySelector("#plate-name");
const summonEl = root.querySelector("#summon");
const splash = root.querySelector("#splash");
if (!reel || !plateName || !summonEl || !splash) throw new Error("stage mounted");

check(state.balls.length === fighters.length, "drawn balls live on the shared state object");
check(state.balls[0]?.stars.length === 1, "the shared ball list keeps the one-star layout");

const card = reel.querySelectorAll(".card")[0];
fire(reel, "pointerdown", { button: 0, clientX: 0, pointerId: 3, target: card });
fire(reel, "pointermove", { button: 0, clientX: -180, pointerId: 3, target: card });
check(state.drag !== 0, "a pointer move writes the shared drag field");
fire(reel, "pointerup", { button: 0, clientX: -180, pointerId: 3, target: card });
check(state.drag === 0, "releasing a drag clears the shared drag field");
check(state.index === 1, "releasing a drag writes the shared index");
check(plateName.textContent === "Piccolo", "card paint reads the shared index");

fire(reel, "click", { detail: 0, target: reel.querySelectorAll(".card")[1] });
check(state.summonOpen, "opening summon sets the shared summonOpen flag");
check(summonEl.classList.contains("is-open"), "opening summon shows the dialog");
fire(root.querySelector("#summon-close")!, "click", {});
check(!state.summonOpen, "closing summon clears the shared summonOpen flag");
check(!summonEl.classList.contains("is-open"), "closing summon hides the dialog");

let left = 0;
createSplash({
  onLeave() {
    left += 1;
  },
});
fire(splash, "click", {});
await new Promise((resolve) => setTimeout(resolve, 0));
check(left === 1, "leaving the splash notifies the reel once");
check(splash.parent === null, "leaving the splash removes it");
fire(splash, "click", {});
await new Promise((resolve) => setTimeout(resolve, 0));
check(left === 1, "the splash leave runs once");

if (failures.length) throw new Error(failures.join("\n"));

export {};
