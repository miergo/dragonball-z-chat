import "./style.css";
import { createChat } from "./chat";
import { STAR_EN, STAR_JA, fighters } from "./characters";

const COUNT = fighters.length;
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Vec3 = [number, number, number];

function sphere(deg: number, lift: number): Vec3 {
  const t = (deg * Math.PI) / 180;
  const p = (lift * Math.PI) / 180;
  return [Math.sin(t) * Math.cos(p), Math.sin(p), Math.cos(t) * Math.cos(p)];
}

const STAR_LAYOUT: Record<number, Vec3[]> = {
  1: [sphere(0, 0)],
  2: [sphere(-16, 4), sphere(16, -4)],
  3: [sphere(0, -16), sphere(-18, 10), sphere(18, 10)],
  4: [sphere(0, -16), sphere(-16, 0), sphere(16, 0), sphere(0, 16)],
  5: [sphere(0, -18), sphere(-20, -2), sphere(20, -2), sphere(-12, 14), sphere(12, 14)],
  6: [
    sphere(-18, -12),
    sphere(0, -16),
    sphere(18, -12),
    sphere(-18, 10),
    sphere(0, 14),
    sphere(18, 10),
  ],
  7: [
    sphere(0, 0),
    sphere(-20, -14),
    sphere(0, -18),
    sphere(20, -14),
    sphere(-20, 14),
    sphere(0, 18),
    sphere(20, 14),
  ],
};

const STAR_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12,1.4 14.9,8.2 22.2,8.7 16.7,13.5 18.8,20.8 12,16.9 5.2,20.8 7.3,13.5 1.8,8.7 9.1,8.2" fill="#d00606"/></svg>';

type Ball = {
  root: HTMLElement;
  stars: { el: HTMLElement; home: Vec3 }[];
  phase: number;
};

const balls: Ball[] = [];

function mod(n: number): number {
  return ((n % COUNT) + COUNT) % COUNT;
}

function wrapDelta(i: number, focus: number): number {
  let d = i - focus;
  d = ((d % COUNT) + COUNT) % COUNT;
  if (d > COUNT / 2) d -= COUNT;
  return d;
}

function makeBall(host: HTMLElement, stars: number, phase: number): void {
  host.innerHTML = `<div class="dball-stars"></div><div class="dball-sheen"></div><div class="dball-gloss"></div><i class="spark s1"></i><i class="spark s2"></i>`;
  const layer = host.querySelector(".dball-stars")!;
  const size = stars === 1 ? 26 : stars >= 6 ? 13 : 16;
  const placed = STAR_LAYOUT[stars].map((home) => {
    const el = document.createElement("span");
    el.className = "star";
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.innerHTML = STAR_SVG;
    layer.append(el);
    return { el, home };
  });
  balls.push({ root: host, stars: placed, phase });
}

function rotY([x, y, z]: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
}

function drawBalls(angle: number): void {
  for (const ball of balls) {
    const rock = reduced ? 0.35 : Math.sin(angle + ball.phase) * 0.95;
    ball.root.style.setProperty("--glide", Math.sin(angle * 1.4 + ball.phase).toFixed(3));
    for (const star of ball.stars) {
      const [x, y, z] = rotY(star.home, rock);
      const depth = (z + 1) / 2;
      const fade = z < 0.05 ? Math.max(0, (z + 0.25) / 0.3) : 1;
      star.el.style.left = `${50 + x * 33}%`;
      star.el.style.top = `${50 - y * 33}%`;
      star.el.style.opacity = fade.toFixed(3);
      star.el.style.transform = `translate(-50%, -50%) scale(${(0.55 + depth * 0.55).toFixed(3)})`;
      star.el.style.zIndex = String(Math.round(depth * 10));
    }
  }
}

const reel = document.querySelector<HTMLElement>("#reel")!;
const plateIndex = document.querySelector<HTMLElement>("#plate-index")!;
const plateName = document.querySelector<HTMLElement>("#plate-name")!;
const plateJa = document.querySelector<HTMLElement>("#plate-ja")!;
const plateLine = document.querySelector<HTMLElement>("#plate-line")!;
const site = document.querySelector<HTMLElement>("#site")!;
const summon = document.querySelector<HTMLElement>("#summon")!;

const cards: HTMLButtonElement[] = fighters.map((fighter, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "card";
  button.dataset.index = String(index);
  button.style.setProperty("--aura", fighter.color);
  button.setAttribute(
    "aria-label",
    fighter.soon
      ? `${STAR_EN[fighter.stars]} Dragon Ball. Coming soon.`
      : `${STAR_EN[fighter.stars]} Dragon Ball, ${fighter.name}. Click to bring forward or summon.`,
  );

  const icon = fighter.image
    ? `<img class="pop-img" src="${fighter.image}" alt="" />`
    : `<p class="soon-pop">Coming soon</p>`;

  button.innerHTML = `
    <div class="pop">${icon}</div>
    <div class="card-frame">
      <span class="ghost-num">${fighter.stars}</span>
      <div class="dball" data-stars="${fighter.stars}"></div>
      <p class="card-label">${STAR_EN[fighter.stars]}<small lang="ja">${STAR_JA[fighter.stars]}</small></p>
    </div>
  `;
  reel.append(button);
  const ball = button.querySelector<HTMLElement>(".dball")!;
  makeBall(ball, fighter.stars, index * 0.85);
  return button;
});

let index = 0;
let drag = 0;
let dragging = false;
let lastActive = -1;
let summonOpen = false;
let zooming = false;

const chat = createChat({
  onClose() {
    site.toggleAttribute("inert", false);
    cards[index].focus();
  },
});

function blocked(): boolean {
  return summonOpen || zooming || chat.isOpen();
}

function spread(): number {
  const card = cards[0];
  return Math.max(150, card.offsetWidth * 0.78);
}

function paint(pop: boolean): void {
  const visual = index + drag;
  const active = mod(Math.round(visual));
  const gap = spread();

  cards.forEach((card, i) => {
    const d = wrapDelta(i, visual);
    const abs = Math.abs(d);
    const x = d * gap;
    const z = -abs * 110;
    const rot = d * -46;
    const scale = 1 - Math.min(abs, 2.2) * 0.07;
    const opacity = abs > 2.25 ? 0 : 1 - abs * 0.14;
    card.style.transform = `translate(-50%, -50%) translateX(${x}px) translateZ(${z}px) rotateY(${rot}deg) scale(${scale})`;
    card.style.opacity = opacity.toFixed(3);
    card.style.zIndex = String(20 - Math.round(abs * 4));
    card.style.visibility = abs > 2.6 ? "hidden" : "visible";
    const on = i === active;
    card.classList.toggle("is-active", on);
    if (on) card.setAttribute("aria-current", "true");
    else card.removeAttribute("aria-current");
    if (!on) card.querySelector(".pop")?.classList.remove("pop-in");
  });

  const fighter = fighters[active];
  plateIndex.textContent = String(fighter.stars).padStart(2, "0");
  plateName.textContent = fighter.name;
  plateJa.textContent = fighter.nameJa;
  plateLine.textContent = fighter.title ? `${fighter.title}. ${fighter.line}` : fighter.line;

  if (pop && active !== lastActive) {
    lastActive = active;
    const popEl = cards[active].querySelector(".pop");
    if (popEl) {
      popEl.classList.remove("pop-in");
      void (popEl as HTMLElement).offsetWidth;
      popEl.classList.add("pop-in");
    }
  }
}

function goTo(next: number): void {
  if (blocked()) return;
  index = mod(next);
  drag = 0;
  reel.classList.remove("is-dragging");
  paint(true);
}

document.querySelector("#prev")!.addEventListener("click", () => goTo(index - 1));
document.querySelector("#next")!.addEventListener("click", () => goTo(index + 1));

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && chat.isOpen()) {
    chat.close();
    return;
  }
  if (event.key === "Escape" && summonOpen && !zooming) {
    closeSummon();
    return;
  }
  if (blocked()) return;
  if (event.key === "ArrowRight") goTo(index + 1);
  if (event.key === "ArrowLeft") goTo(index - 1);
  if (event.key === "Enter" && document.activeElement === document.body) openSummon(index);
});

let pointerX = 0;
let pointerId = -1;
let moved = 0;
let downCard: HTMLElement | null = null;

reel.addEventListener("pointerdown", (event) => {
  if (blocked() || event.button !== 0) return;
  dragging = true;
  pointerX = event.clientX;
  pointerId = event.pointerId;
  moved = 0;
  downCard = (event.target as HTMLElement).closest<HTMLElement>(".card");
  reel.classList.add("is-dragging");
  reel.setPointerCapture(event.pointerId);
});

reel.addEventListener("pointermove", (event) => {
  if (!dragging || event.pointerId !== pointerId) return;
  const dx = event.clientX - pointerX;
  moved = dx;
  drag = -dx / spread();
  paint(false);
});

function choose(card: HTMLElement | null): void {
  if (!card || blocked()) return;
  const picked = Number(card.dataset.index);
  if (fighters[picked].soon) {
    if (picked !== index) goTo(picked);
    openSummon(picked);
    return;
  }
  if (picked === index) openSummon(picked);
  else goTo(picked);
}

function endDrag(event: PointerEvent): void {
  if (!dragging || event.pointerId !== pointerId) return;
  dragging = false;
  reel.classList.remove("is-dragging");
  const card = downCard;
  downCard = null;
  if (Math.abs(moved) < 24) {
    drag = 0;
    choose(card);
    return;
  }
  index = mod(Math.round(index + drag));
  drag = 0;
  paint(true);
}

reel.addEventListener("click", (event) => {
  if (event.detail !== 0) return;
  choose((event.target as HTMLElement).closest<HTMLElement>(".card"));
});

reel.addEventListener("pointerup", endDrag);
reel.addEventListener("pointercancel", endDrag);

let wheelLock = 0;
reel.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    if (blocked()) return;
    const now = performance.now();
    if (now < wheelLock) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (Math.abs(delta) < 8) return;
    wheelLock = now + 420;
    goTo(index + (delta > 0 ? 1 : -1));
  },
  { passive: false },
);

function openSummon(i: number): void {
  const fighter = fighters[i];
  const figure = document.querySelector<HTMLElement>("#summon-figure")!;
  const kicker = document.querySelector<HTMLElement>(".summon-kicker")!;
  const vert = document.querySelector<HTMLElement>(".summon-vert")!;
  figure.replaceChildren();
  summon.classList.toggle("is-soon", Boolean(fighter.soon));
  if (fighter.soon) {
    kicker.innerHTML = `Coming soon <span lang="ja">近日公開</span>`;
    vert.textContent = "近日";
    document.querySelector("#summon-name")!.textContent = "We are working on this character";
    document.querySelector("#summon-ja")!.textContent = "";
    document.querySelector("#summon-line")!.textContent = "";
  } else {
    const img = document.createElement("img");
    img.src = fighter.image ?? "";
    img.alt = `${fighter.name}, summoned`;
    figure.append(img);
    kicker.innerHTML = `Come forth <span lang="ja">出でよ</span>`;
    vert.textContent = "召喚";
    document.querySelector("#summon-name")!.textContent = fighter.name;
    document.querySelector("#summon-ja")!.textContent = fighter.nameJa;
    document.querySelector("#summon-line")!.textContent = fighter.line;
  }
  summon.style.setProperty("--aura", fighter.color);
  summon.classList.remove("is-open");
  void summon.offsetWidth;
  summon.classList.add("is-open");
  summon.setAttribute("aria-hidden", "false");
  summonOpen = true;
  site.toggleAttribute("inert", true);
  const chatBtn = document.querySelector<HTMLButtonElement>("#summon-chat")!;
  chatBtn.hidden = Boolean(fighter.soon) || !fighter.id;
  (chatBtn.hidden ? document.querySelector<HTMLButtonElement>("#summon-close")! : chatBtn).focus();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function beginChat(): Promise<void> {
  const fighter = fighters[index];
  if (zooming || chat.isOpen() || !fighter.id) return;
  zooming = true;
  const chatBtn = document.querySelector<HTMLButtonElement>("#summon-chat")!;
  chatBtn.disabled = true;
  chat.start(fighter);
  summon.classList.add("is-zoom");
  if (!reduced) await wait(340);
  chat.reveal();
  if (!reduced) await wait(180);
  summon.classList.remove("is-open", "is-zoom");
  summon.setAttribute("aria-hidden", "true");
  summonOpen = false;
  zooming = false;
  chatBtn.disabled = false;
}

function closeSummon(): void {
  if (zooming || chat.isOpen()) return;
  summon.classList.remove("is-open", "is-zoom");
  summon.setAttribute("aria-hidden", "true");
  summonOpen = false;
  site.toggleAttribute("inert", false);
  cards[index].focus();
}

document.querySelector("#summon-chat")!.addEventListener("click", () => {
  void beginChat();
});
document.querySelector("#summon-close")!.addEventListener("click", closeSummon);
summon.addEventListener("click", (event) => {
  if (event.target === summon) closeSummon();
});

window.addEventListener("resize", () => paint(false));

let spin = 0;
let last = performance.now();
function tick(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!reduced) spin += dt * 0.9;
  drawBalls(spin);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

paint(false);

const splash = document.querySelector<HTMLElement>("#splash")!;
const splashMs = reduced ? 400 : 3400;
let splashGone = false;

function leaveSplash(fadeMs: number): void {
  if (splashGone) return;
  splashGone = true;
  splash.classList.add("is-leaving");
  window.setTimeout(() => {
    splash.remove();
    paint(true);
  }, fadeMs);
}

window.setTimeout(() => leaveSplash(reduced ? 0 : 1100), splashMs);
splash.addEventListener("click", () => leaveSplash(reduced ? 0 : 700));
