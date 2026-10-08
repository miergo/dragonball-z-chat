import { STAR_EN, type Fighter } from "./characters";

type Place = "plate" | "summon" | "chat";

type Slots = {
  name: HTMLElement;
  nameJa: HTMLElement;
  line: HTMLElement;
  figure?: HTMLElement;
  hero?: HTMLElement;
};

export function setFighterIdentity(fighter: Fighter, place: Place, slots: Slots): void {
  const soonSummon = place === "summon" && Boolean(fighter.soon);
  slots.name.textContent = soonSummon ? "We are working on this character" : fighter.name;
  slots.nameJa.textContent = soonSummon ? "" : fighter.nameJa;
  slots.line.textContent = lineText(fighter, place);
  if (place !== "plate" && slots.figure) fillFigure(slots.figure, fighter, place);
  if (place === "chat" && slots.hero) fillHero(slots.hero, fighter);
}

function lineText(fighter: Fighter, place: Place): string {
  if (place === "summon") return fighter.soon ? "" : fighter.line;
  if (place === "chat") {
    const star = STAR_EN[fighter.stars] ?? "";
    return fighter.title ? `${star} · ${fighter.title}` : star;
  }
  return fighter.title ? `${fighter.title}. ${fighter.line}` : fighter.line;
}

function fillFigure(figure: HTMLElement, fighter: Fighter, place: Place): void {
  figure.replaceChildren();
  if (place === "summon") {
    if (fighter.soon) return;
    const img = document.createElement("img");
    img.src = fighter.image ?? "";
    img.alt = `${fighter.name}, summoned`;
    figure.append(img);
    return;
  }
  if (fighter.image) {
    const img = document.createElement("img");
    img.src = fighter.image;
    img.alt = "";
    figure.append(img);
    return;
  }
  const seal = document.createElement("div");
  seal.className = "seal";
  seal.style.setProperty("--seal", fighter.color);
  seal.textContent = String(fighter.stars);
  figure.append(seal);
}

function fillHero(hero: HTMLElement, fighter: Fighter): void {
  const el = document.createElement("span");
  el.className = "msg-icon chat-hero-icon";
  el.setAttribute("aria-hidden", "true");
  if (fighter.image) {
    const img = document.createElement("img");
    img.src = fighter.image;
    img.alt = "";
    el.append(img);
  } else {
    el.classList.add("msg-icon-seal");
    el.textContent = String(fighter.stars);
  }
  hero.replaceChildren(el);
}
