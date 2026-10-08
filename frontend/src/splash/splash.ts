export function createSplash(hooks: { onLeave(): void }): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const splash = document.querySelector<HTMLElement>("#splash")!;
  const splashMs = reduced ? 400 : 3400;
  let splashGone = false;

  function leaveSplash(fadeMs: number): void {
    if (splashGone) return;
    splashGone = true;
    splash.classList.add("is-leaving");
    window.setTimeout(() => {
      splash.remove();
      hooks.onLeave();
    }, fadeMs);
  }

  window.setTimeout(() => leaveSplash(reduced ? 0 : 1100), splashMs);
  splash.addEventListener("click", () => leaveSplash(reduced ? 0 : 700));
}
