import { fighters, type Fighter } from "../characters/characters";
import { setFighterIdentity } from "../characters/identity";

type SummonState = {
  index: number;
  summonOpen: boolean;
};

type ChatGate = {
  start(fighter: Fighter): void;
  reveal(): void;
  isOpen(): boolean;
};

type SummonHooks = {
  chat: ChatGate;
  stopReel(): void;
  focusCard(): void;
};

export function createSummon(state: SummonState, hooks: SummonHooks) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const summon = document.querySelector<HTMLElement>("#summon")!;
  const site = document.querySelector<HTMLElement>("#site")!;
  let zooming = false;

  function openSummon(i: number): void {
    const fighter = fighters[i];
    const figure = document.querySelector<HTMLElement>("#summon-figure")!;
    const kicker = document.querySelector<HTMLElement>(".summon-kicker")!;
    const vert = document.querySelector<HTMLElement>(".summon-vert")!;
    summon.classList.toggle("is-soon", Boolean(fighter.soon));
    if (fighter.soon) {
      kicker.innerHTML = `Coming soon <span lang="ja">近日公開</span>`;
      vert.textContent = "近日";
    } else {
      kicker.innerHTML = `Come forth <span lang="ja">出でよ</span>`;
      vert.textContent = "召喚";
    }
    setFighterIdentity(fighter, "summon", {
      name: document.querySelector<HTMLElement>("#summon-name")!,
      nameJa: document.querySelector<HTMLElement>("#summon-ja")!,
      line: document.querySelector<HTMLElement>("#summon-line")!,
      figure,
    });
    summon.style.setProperty("--aura", fighter.color);
    summon.classList.remove("is-open");
    void summon.offsetWidth;
    summon.classList.add("is-open");
    summon.setAttribute("aria-hidden", "false");
    state.summonOpen = true;
    site.toggleAttribute("inert", true);
    const chatBtn = document.querySelector<HTMLButtonElement>("#summon-chat")!;
    chatBtn.hidden = Boolean(fighter.soon) || !fighter.id;
    (chatBtn.hidden ? document.querySelector<HTMLButtonElement>("#summon-close")! : chatBtn).focus();
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function beginChat(): Promise<void> {
    const fighter = fighters[state.index];
    if (zooming || hooks.chat.isOpen() || !fighter.id) return;
    zooming = true;
    const chatBtn = document.querySelector<HTMLButtonElement>("#summon-chat")!;
    chatBtn.disabled = true;
    hooks.chat.start(fighter);
    summon.classList.add("is-zoom");
    if (!reduced) await wait(340);
    hooks.chat.reveal();
    hooks.stopReel();
    if (!reduced) await wait(180);
    summon.classList.remove("is-open", "is-zoom");
    summon.setAttribute("aria-hidden", "true");
    state.summonOpen = false;
    zooming = false;
    chatBtn.disabled = false;
  }

  function closeSummon(): void {
    if (zooming || hooks.chat.isOpen()) return;
    summon.classList.remove("is-open", "is-zoom");
    summon.setAttribute("aria-hidden", "true");
    state.summonOpen = false;
    site.toggleAttribute("inert", false);
    hooks.focusCard();
  }

  document.querySelector("#summon-chat")!.addEventListener("click", () => {
    void beginChat();
  });
  document.querySelector("#summon-close")!.addEventListener("click", closeSummon);
  summon.addEventListener("click", (event) => {
    if (event.target === summon) closeSummon();
  });

  return {
    open: openSummon,
    close: closeSummon,
    busy: () => zooming,
  };
}
