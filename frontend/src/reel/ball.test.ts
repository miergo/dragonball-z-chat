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
  offsetWidth: number;
  style: { setProperty(name: string, value: string): void } & Record<string, string>;
  classList: {
    add(token: string): void;
    remove(token: string): void;
    toggle(token: string, force?: boolean): boolean;
    contains(token: string): boolean;
  };
  innerHTML: string;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  append(...nodes: TestEl[]): void;
  addEventListener(): void;
  remove(): void;
  focus(): void;
  querySelector(sel: string): TestEl | null;
  querySelectorAll(sel: string): TestEl[];
};

function classes(el: TestEl): string[] {
  return el.className.split(/\s+/).filter(Boolean);
}

function matches(el: TestEl, sel: string): boolean {
  if (sel.startsWith("#")) return el.id === sel.slice(1);
  if (sel.startsWith(".")) return classes(el).includes(sel.slice(1));
  return el.tagName.toLowerCase() === sel.toLowerCase();
}

function walk(el: TestEl, sel: string): TestEl | null {
  for (const kid of el.children) {
    if (matches(kid, sel)) return kid;
    const found = walk(kid, sel);
    if (found) return found;
  }
  return null;
}

function collect(el: TestEl, sel: string, out: TestEl[]): void {
  for (const kid of el.children) {
    if (matches(kid, sel)) out.push(kid);
    collect(kid, sel, out);
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
    stack[stack.length - 1].children.push(el);
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
    offsetWidth: 240,
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
    remove(token: string) {
      el.className = classes(el).filter((part) => part !== token).join(" ");
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
  el.append = (...nodes: TestEl[]) => {
    el.children.push(...nodes);
  };
  el.addEventListener = () => {};
  el.remove = () => {};
  el.focus = () => {};
  el.querySelector = (sel: string) => walk(el, sel);
  el.querySelectorAll = (sel: string) => {
    const out: TestEl[] = [];
    collect(el, sel, out);
    return out;
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

function installDom(): void {
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
    root.children.push(node);
  }
  let framed = false;
  const win = globalThis as typeof globalThis & Window;
  win.window = win;
  win.matchMedia = (() => ({ matches: false })) as unknown as Window["matchMedia"];
  win.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    if (!framed) {
      framed = true;
      cb(0);
    }
    return 1;
  }) as unknown as Window["requestAnimationFrame"];
  win.addEventListener = () => {};
  globalThis.document = {
    hidden: false,
    addEventListener() {},
    createElement(tag: string) {
      return create(tag) as unknown as HTMLElement;
    },
    querySelector(sel: string) {
      return walk(root, sel) as unknown as HTMLElement | null;
    },
    querySelectorAll(sel: string) {
      const out: TestEl[] = [];
      collect(root, sel, out);
      return out as unknown as NodeListOf<Element>;
    },
  } as unknown as Document;
}

function check(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

function stars(card: Element): number {
  return card.querySelectorAll(".star").length;
}

installDom();

const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
  // Splash schedules a 400ms or 3400ms timer. Skip it so this test stays synchronous.
  if ((ms ?? 0) >= 400) return 0 as unknown as ReturnType<typeof setTimeout>;
  return realSetTimeout(fn as never, ms, ...args);
}) as typeof setTimeout;

const { fighters } = await import("../characters/characters");
fighters.push(
  {
    stars: 0,
    name: "Empty",
    nameJa: "",
    title: "",
    line: "",
    color: "#888",
    soon: true,
  },
  {
    stars: 8,
    name: "Unplaced",
    nameJa: "",
    title: "",
    line: "",
    color: "#888",
  },
);

try {
  await import("../main");
} finally {
  globalThis.setTimeout = realSetTimeout;
}

const reel = document.querySelector("#reel");
if (!reel) throw new Error("reel mounted");
const cards = Array.from(reel.querySelectorAll(".card"));
check(cards.length === fighters.length, "every slot becomes a card");
check(stars(cards[0]) === 1, "one-star ball still draws its star");
check(stars(cards[3]) === 4, "a slot with no id still draws its stars");
const empty = cards[7];
check(stars(empty) === 0, "missing star layout draws no stars");
check(empty.querySelector(".dball-sheen"), "plain ball keeps the sheen");
check(empty.querySelector(".dball-gloss"), "plain ball keeps the gloss");
check(empty.querySelector(".dball-stars"), "plain ball keeps the star layer");
check(stars(cards[8]) === 0, "a star count outside the layout draws a plain ball");
check(!("id" in fighters[3]) || fighters[3].id === undefined, "coming-soon slot has no id");
check(fighters[7].id === undefined, "empty slot has no id");

export {};
