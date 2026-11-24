/**
 * FLIP card flight (8C, reworked in 8C.1): a floating clone (position: fixed) moves like a
 * hand carrying the card from where it was picked (tray thumbnail or source pocket) to just
 * over the opening of its destination sleeve. The real card then slides into the sleeve,
 * behind its front plastic (CSS entry in binders.css).
 *
 * One Web Animations API animation carries three phases through keyframe offsets:
 *   1. lift      150 ms  rises a little (scale × 1.06) and the shadow grows
 *   2. flight    550 ms  a curved path (elevated above the straight line in proportion to
 *                        the distance), a slight tilt toward the direction of travel, and
 *                        a deceleration at the end, to hover over the sleeve's opening
 *   3. descent   150 ms  down to the opening: the real card's size, a −2° tilt and no
 *                        shadow, exactly where the real card's entry starts
 * The keyframes are computed once, and nothing runs frame by frame in JavaScript.
 *
 * Hand-off: the clone ends on the first frame of the real card's entry (one card height
 * above its place, `translateY(-100%) rotate(-2deg)` around its bottom centre), and
 * `onLand` runs in the same task that removes the clone, so both changes paint together.
 *
 * While the clone flies the original stays in the layout but invisible (`visibility:
 * hidden`), so there is never a second card. It is restored when the flight ends or is
 * cancelled, and the clone is always removed.
 */
export const LIFT_MS = 150;
export const FLIGHT_MS = 550;
export const DESCENT_MS = 150;
export const TOTAL_FLIGHT_MS = LIFT_MS + FLIGHT_MS + DESCENT_MS;
export const PAGE_TURN_WAIT_MS = 300;
export const LIFT_SCALE = 1.06;
/** Tilt the card has when it reaches the opening; the sleeve entry straightens it. */
export const ENTRY_TILT_DEG = -2;
/** How far above the opening the card hovers before its descent. */
export const HOVER_PX = 14;
/** Deceleration at the end of the flight. */
export const FLIGHT_EASING = [0.22, 0.61, 0.36, 1] as const;

const LIFT_PX = 8;
const SAMPLES = 12;
const SHADOW_NONE = "0 0 0 color-mix(in srgb, var(--pv-shadow-color) 0%, transparent)";
const SHADOW_RAISED = "0 18px 32px color-mix(in srgb, var(--pv-shadow-color) 55%, transparent)";

export type Box = Pick<DOMRect, "left" | "top" | "width" | "height">;
/** `rect` is in document coordinates, so a scroll between the click and the flight is accounted for. */
export type FlightOrigin = { rect: Box; ghost: HTMLElement; element: HTMLElement };
export type FlightResult = "completed" | "cancelled" | "skipped";

/**
 * Captures the card where the user picked it: its box (in document coordinates), a
 * detached visual copy and the live element (to hide it). Call it in the click handler,
 * before anything closes or re-renders.
 */
export function captureOrigin(element: Element | null | undefined): FlightOrigin | null {
  if (!element) return null;
  const box = element.getBoundingClientRect();
  return {
    rect: { left: box.left + window.scrollX, top: box.top + window.scrollY, width: box.width, height: box.height },
    ghost: element.cloneNode(true) as HTMLElement,
    element: element as HTMLElement,
  };
}

export function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export function inViewport(element: Element) {
  const box = element.getBoundingClientRect();
  return box.top >= 0 && box.bottom <= window.innerHeight;
}

/**
 * Resolves once `element` stops moving (a smooth scroll is over), checked every 16 ms,
 * at most `limit` ms. Safari's smooth scroll takes longer than a fixed wait.
 */
export async function settled(element: Element, isCurrent: () => boolean = () => true, limit = 1000) {
  let last = element.getBoundingClientRect().top;
  let still = 0;
  for (let elapsed = 0; elapsed < limit && still < 3 && isCurrent(); elapsed += 16) {
    await wait(16);
    const top = element.getBoundingClientRect().top;
    still = Math.abs(top - last) < 0.5 ? still + 1 : 0;
    last = top;
  }
}

/** y of a CSS cubic-bezier(x1, y1, x2, y2) at time `t` (0..1), by bisection on x. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const curve = (s: number, a: number, b: number) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s ** 2 * b + s ** 3;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let low = 0; let high = 1;
    for (let step = 0; step < 24; step++) {
      const middle = (low + high) / 2;
      if (curve(middle, x1, x2) < t) low = middle; else high = middle;
    }
    return curve((low + high) / 2, y1, y2);
  };
}

/**
 * Where the clone (laid out at `from`'s corner with `card`'s size, transform-origin top
 * left) must be translated so it covers the real card's first entry frame: one card
 * height above its place, rotated `ENTRY_TILT_DEG` around its bottom centre.
 */
export function entryStart(from: Box, card: Box) {
  const angle = (ENTRY_TILT_DEG * Math.PI) / 180;
  const originX = card.width / 2; const originY = card.height;
  const rotatedX = originX * Math.cos(angle) - originY * Math.sin(angle);
  const rotatedY = originX * Math.sin(angle) + originY * Math.cos(angle);
  return { x: card.left - from.left + originX - rotatedX, y: card.top - from.top - card.height + originY - rotatedY };
}

/**
 * Keyframes (with offsets) for the whole flight. `from` is the picked card's box and `card`
 * the real card at rest in its sleeve, both in viewport coordinates. Pure: used by the
 * animation and by its tests. Every frame has the same `translate rotate scale` list, so
 * the browser interpolates each function on its own.
 */
export function buildFlightKeyframes(from: Box, card: Box): { keyframes: Keyframe[]; duration: number } {
  const startX = card.width ? from.width / card.width : 1;
  const startY = card.height ? from.height / card.height : 1;
  // Centres: the picked card, and the card hovering over the opening (one height above its place).
  const start = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
  const hover = { x: card.left + card.width / 2, y: card.top - card.height / 2 - HOVER_PX };
  const lifted = { x: start.x, y: start.y - LIFT_PX };
  const distance = Math.hypot(hover.x - lifted.x, hover.y - lifted.y);
  const arc = Math.min(180, Math.max(28, distance * 0.2));
  const direction = Math.abs(hover.x - start.x) < 4 ? 0 : Math.sign(hover.x - start.x);
  const tilt = direction * Math.min(9, Math.max(3, distance / 80));
  const ease = cubicBezier(...FLIGHT_EASING);
  const liftEnd = LIFT_MS / TOTAL_FLIGHT_MS;
  const landing = (LIFT_MS + FLIGHT_MS) / TOTAL_FLIGHT_MS;
  // Places the clone's visual centre at `centre` (it scales and turns around its top-left corner).
  const centred = (centre: { x: number; y: number }, scaleX: number, scaleY: number, rotate = 0) => {
    const angle = (rotate * Math.PI) / 180; const halfX = (scaleX * card.width) / 2; const halfY = (scaleY * card.height) / 2;
    return { x: centre.x - (halfX * Math.cos(angle) - halfY * Math.sin(angle)) - from.left, y: centre.y - (halfX * Math.sin(angle) + halfY * Math.cos(angle)) - from.top };
  };
  const frame = (offset: number, at: { x: number; y: number }, scaleX: number, scaleY: number, rotate: number, shadow: string, easing?: string): Keyframe =>
    ({ offset, transform: `translate(${at.x}px, ${at.y}px) rotate(${rotate}deg) scale(${scaleX}, ${scaleY})`, boxShadow: shadow, ...(easing ? { easing } : {}) });

  const keyframes: Keyframe[] = [frame(0, { x: 0, y: 0 }, startX, startY, 0, SHADOW_NONE, "cubic-bezier(.2, .7, .2, 1)")];
  keyframes.push(frame(liftEnd, centred(lifted, startX * LIFT_SCALE, startY * LIFT_SCALE), startX * LIFT_SCALE, startY * LIFT_SCALE, 0, SHADOW_RAISED, "linear"));
  for (let sample = 1; sample <= SAMPLES; sample++) {
    const progress = ease(sample / SAMPLES);  // decelerates toward the opening
    const scaleX = (startX + (1 - startX) * progress) * LIFT_SCALE;
    const scaleY = (startY + (1 - startY) * progress) * LIFT_SCALE;
    const centre = {
      x: lifted.x + (hover.x - lifted.x) * progress,
      y: lifted.y + (hover.y - lifted.y) * progress - arc * 4 * progress * (1 - progress),
    };
    const rotate = tilt * Math.sin(Math.PI * progress) + ENTRY_TILT_DEG * progress;
    const last = sample === SAMPLES;
    keyframes.push(frame(liftEnd + (landing - liftEnd) * (sample / SAMPLES), centred(centre, scaleX, scaleY, rotate), scaleX, scaleY, rotate,
      SHADOW_RAISED, last ? "cubic-bezier(.3, 0, .2, 1)" : "linear"));
  }
  keyframes.push(frame(1, entryStart(from, card), 1, 1, ENTRY_TILT_DEG, SHADOW_NONE));
  return { keyframes, duration: TOTAL_FLIGHT_MS };
}

/**
 * Flies the clone to `card` (the real card element, hidden in its sleeve). Resolves
 * "completed" at the end, "cancelled" when the signal aborts (the animation is cancelled),
 * or "skipped" when animations are unsupported. On completion `onLand` runs before the
 * clone is removed, in the same task. The original is hidden meanwhile and always
 * restored; the clone is always removed.
 */
export async function flyCard(origin: FlightOrigin, card: Element, { signal, onLand }: { signal?: AbortSignal; onLand?: () => void } = {}): Promise<FlightResult> {
  const { ghost, element } = origin;
  if (typeof ghost.animate !== "function" || signal?.aborted) return signal?.aborted ? "cancelled" : "skipped";
  // The click-time box, back in viewport coordinates after any scroll since then.
  const from: Box = { ...origin.rect, left: origin.rect.left - window.scrollX, top: origin.rect.top - window.scrollY };
  const to = card.getBoundingClientRect();
  ghost.classList.add("pv-flight");
  ghost.setAttribute("aria-hidden", "true");
  // Laid out at the destination size (crisp at the end), scaled down to the picked card at the start.
  Object.assign(ghost.style, {
    position: "fixed", left: `${from.left}px`, top: `${from.top}px`, width: `${to.width}px`, height: `${to.height}px`,
    margin: "0", zIndex: "60", pointerEvents: "none", transformOrigin: "0 0",
  });
  const previous = element.style.visibility;
  element.style.visibility = "hidden";
  document.body.appendChild(ghost);
  const { keyframes, duration } = buildFlightKeyframes(from, to);
  const animation = ghost.animate(keyframes, { duration, easing: "linear", fill: "forwards" });
  const cancel = () => animation.cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  let landed = false;
  try {
    await animation.finished;
    landed = !signal?.aborted;
    if (landed) onLand?.();
  } catch {
    // Cancelled (a new action, or unmount): the clone is still removed below.
  } finally {
    signal?.removeEventListener("abort", cancel);
    ghost.remove();
    element.style.visibility = previous;
  }
  return landed ? "completed" : "cancelled";
}
