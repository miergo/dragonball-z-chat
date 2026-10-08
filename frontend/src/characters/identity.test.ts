import type { Fighter } from "./characters";
import { setFighterIdentity } from "./identity";

type NodeRec = {
  kids: HTMLElement[];
  vars: Record<string, string>;
  attrs: Record<string, string>;
};

const nodes = new WeakMap<HTMLElement, NodeRec>();

function rec(el: HTMLElement): NodeRec {
  const found = nodes.get(el);
  if (!found) throw new Error("missing test node");
  return found;
}

function installDocument(): void {
  function createElement(tag: string): HTMLElement {
    const kids: HTMLElement[] = [];
    const vars: Record<string, string> = {};
    const attrs: Record<string, string> = {};
    const el = {
      tagName: tag.toUpperCase(),
      textContent: "",
      className: "",
      src: "",
      alt: "",
      style: {
        setProperty(name: string, value: string) {
          vars[name] = value;
        },
      },
      classList: {
        add(token: string) {
          const parts = el.className.split(/\s+/).filter(Boolean);
          if (!parts.includes(token)) parts.push(token);
          el.className = parts.join(" ");
        },
      },
      setAttribute(name: string, value: string) {
        attrs[name] = value;
      },
      append(...extra: HTMLElement[]) {
        kids.push(...extra);
      },
      replaceChildren(...extra: HTMLElement[]) {
        kids.splice(0, kids.length, ...extra);
      },
    };
    const element = el as unknown as HTMLElement;
    nodes.set(element, { kids, vars, attrs });
    return element;
  }
  globalThis.document = { createElement } as unknown as Document;
}

function check(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

function slots(): {
  name: HTMLElement;
  nameJa: HTMLElement;
  line: HTMLElement;
  figure: HTMLElement;
  hero: HTMLElement;
} {
  return {
    name: document.createElement("h2"),
    nameJa: document.createElement("p"),
    line: document.createElement("p"),
    figure: document.createElement("div"),
    hero: document.createElement("div"),
  };
}

const frieza: Fighter = {
  stars: 1,
  name: "Frieza",
  nameJa: "フリーザ",
  title: "Emperor",
  line: "Cold courtesy, and a wish he intends to keep.",
  color: "#9b5de5",
  image: "/ref/frieza.png",
};

const soon: Fighter = {
  stars: 2,
  name: "Coming soon",
  nameJa: "近日公開",
  title: "",
  line: "This fighter is not on the reel yet.",
  color: "#8a8175",
  soon: true,
};

const bare: Fighter = {
  stars: 3,
  name: "Piccolo",
  nameJa: "ピッコロ",
  title: "Namekian",
  line: "A wish can wait.",
  color: "#2a9d4a",
};

installDocument();

{
  const els = slots();
  const kept = document.createElement("img");
  rec(els.figure).kids.push(kept);
  setFighterIdentity(frieza, "plate", els);
  check(els.name.textContent === "Frieza", "plate name");
  check(els.nameJa.textContent === "フリーザ", "plate ja");
  check(
    els.line.textContent === "Emperor. Cold courtesy, and a wish he intends to keep.",
    "plate line includes title",
  );
  check(rec(els.figure).kids[0] === kept, "plate leaves the figure alone");
}

{
  const els = slots();
  setFighterIdentity(soon, "plate", { name: els.name, nameJa: els.nameJa, line: els.line });
  check(els.name.textContent === "Coming soon", "soon plate name");
  check(els.nameJa.textContent === "近日公開", "soon plate ja");
  check(els.line.textContent === "This fighter is not on the reel yet.", "soon plate line");
}

{
  const els = slots();
  rec(els.figure).kids.push(document.createElement("img"));
  setFighterIdentity(frieza, "summon", els);
  check(els.name.textContent === "Frieza", "summon name");
  check(els.nameJa.textContent === "フリーザ", "summon ja");
  check(
    els.line.textContent === "Cold courtesy, and a wish he intends to keep.",
    "summon line omits title",
  );
  const img = rec(els.figure).kids[0] as HTMLImageElement;
  check(rec(els.figure).kids.length === 1, "summon replaces the figure");
  check(img.tagName === "IMG", "summon figure is an image");
  check(img.src === "/ref/frieza.png", "summon image src");
  check(img.alt === "Frieza, summoned", "summon image alt");
}

{
  const els = slots();
  rec(els.figure).kids.push(document.createElement("img"));
  setFighterIdentity(soon, "summon", els);
  check(els.name.textContent === "We are working on this character", "soon summon name");
  check(els.nameJa.textContent === "", "soon summon ja");
  check(els.line.textContent === "", "soon summon line");
  check(rec(els.figure).kids.length === 0, "soon summon clears the figure");
}

{
  const els = slots();
  setFighterIdentity(bare, "summon", els);
  const img = rec(els.figure).kids[0] as HTMLImageElement;
  check(img.src === "", "summon without an image still mounts an img");
  check(img.alt === "Piccolo, summoned", "bare summon alt");
  check(els.line.textContent === "A wish can wait.", "bare summon line");
}

{
  const els = slots();
  setFighterIdentity(frieza, "chat", els);
  check(els.name.textContent === "Frieza", "chat name");
  check(els.nameJa.textContent === "フリーザ", "chat ja");
  check(els.line.textContent === "One Star · Emperor", "chat kicker");
  const img = rec(els.figure).kids[0] as HTMLImageElement;
  check(img.tagName === "IMG" && img.alt === "" && img.src === "/ref/frieza.png", "chat portrait");
  const hero = rec(els.hero).kids[0];
  check(hero.className === "msg-icon chat-hero-icon", "chat hero class");
  check(rec(hero).attrs["aria-hidden"] === "true", "chat hero hidden");
  const heroImg = rec(hero).kids[0] as HTMLImageElement;
  check(heroImg.tagName === "IMG" && heroImg.src === "/ref/frieza.png", "chat hero image");
}

{
  const els = slots();
  setFighterIdentity(soon, "chat", els);
  check(els.line.textContent === "Two Star", "chat kicker without a title");
  const seal = rec(els.figure).kids[0];
  check(seal.className === "seal", "chat seal class");
  check(seal.textContent === "2", "chat seal stars");
  check(rec(seal).vars["--seal"] === "#8a8175", "chat seal color");
  const hero = rec(els.hero).kids[0];
  check(hero.className === "msg-icon chat-hero-icon msg-icon-seal", "chat hero seal class");
  check(hero.textContent === "2", "chat hero seal stars");
}

{
  const els = slots();
  setFighterIdentity(bare, "plate", els);
  check(els.line.textContent === "Namekian. A wish can wait.", "plate line with title");
  setFighterIdentity(bare, "chat", els);
  check(els.line.textContent === "Three Star · Namekian", "chat kicker with title");
  check(rec(els.figure).kids[0].className === "seal", "chat without an image uses a seal");
}
