/**
 * FLIP card flight (8C): a floating clone (position: fixed) travels from where the card
 * was (tray thumbnail or source pocket) to just above its destination pocket; the
 * pocket then plays its in-sleeve drop. Flight 300 ms + drop 600 ms ≈ 900 ms in total.
 * The clone is always removed, also when the animation is cancelled or unsupported.
 */
export const FLIGHT_MS = 300;
export const PAGE_TURN_WAIT_MS = 300;
export const SCROLL_WAIT_MS = 250;

export type FlightOrigin = { rect: DOMRect; ghost: HTMLElement };

/** Captures the card's current box and a detached visual copy before the DOM changes. */
export function captureOrigin(element: Element | null | undefined): FlightOrigin | null {
  if (!element) return null;
  return { rect: element.getBoundingClientRect(), ghost: element.cloneNode(true) as HTMLElement };
}

export function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export function inViewport(element: Element) {
  const box = element.getBoundingClientRect();
  return box.top >= 0 && box.bottom <= window.innerHeight;
}

export async function flyCard(origin: FlightOrigin, destination: Element): Promise<void> {
  const { rect: from, ghost } = origin;
  if (typeof ghost.animate !== "function") return;
  const to = destination.getBoundingClientRect();
  ghost.classList.add("pv-flight");
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed", left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`,
    margin: "0", zIndex: "60", pointerEvents: "none", transformOrigin: "top left",
  });
  document.body.appendChild(ghost);
  const scaleX = from.width ? to.width / from.width : 1;
  const scaleY = from.height ? to.height / from.height : 1;
  // End above the sleeve: the pocket's own drop animation continues from there.
  const dx = to.left - from.left;
  const dy = to.top - from.top - to.height * 0.6;
  try {
    await ghost.animate([
      { transform: "translate(0, 0) scale(1, 1)", opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`, opacity: 0.85 },
    ], { duration: FLIGHT_MS, easing: "cubic-bezier(.2, .7, .2, 1)", fill: "forwards" }).finished;
  } catch {
    // Cancelled (for example on unmount): the clone is still removed below.
  } finally {
    ghost.remove();
  }
}
