import "./style.css";
import "./reel/reel.css";
import "./summon/summon.css";
import "./chat/chat.css";
import { createChat } from "./chat/chat";
import { createReel, type ReelState } from "./reel/reel";
import { createSplash } from "./splash/splash";
import { createSummon } from "./summon/summon";

const state: ReelState = {
  index: 0,
  drag: 0,
  balls: [],
  summonOpen: false,
};

let reel: ReturnType<typeof createReel>;

const chat = createChat({
  onClose() {
    document.querySelector<HTMLElement>("#site")!.toggleAttribute("inert", false);
    reel.focusActive();
    reel.start();
  },
});

const summon = createSummon(state, {
  chat,
  stopReel: () => reel.stop(),
  focusCard: () => reel.focusActive(),
});

const blocked = () => state.summonOpen || summon.busy() || chat.isOpen();

reel = createReel(state, {
  blocked,
  openSummon: (index) => summon.open(index),
  chatOpen: () => chat.isOpen(),
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && chat.isOpen()) {
    chat.close();
    return;
  }
  if (event.key === "Escape" && state.summonOpen && !summon.busy()) {
    summon.close();
    return;
  }
  if (blocked()) return;
  if (event.key === "ArrowRight") reel.goTo(state.index + 1);
  if (event.key === "ArrowLeft") reel.goTo(state.index - 1);
  if (event.key === "Enter" && document.activeElement === document.body) summon.open(state.index);
});

reel.start();
reel.paint(false);
createSplash({ onLeave: () => reel.paint(true) });
