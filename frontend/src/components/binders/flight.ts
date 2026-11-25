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

// ---------------------------------------------------------------------------------------
// Taking a card out of a binder: the entry in reverse.
// ---------------------------------------------------------------------------------------

/** The real card slides up out of its sleeve, behind the front plastic. */
export const EXIT_MS = 400;
/** Then a clone flies in an arc to the tray (its bar when the tray is folded). */
export const RETURN_MS = 600;
const EXIT_EASING = "cubic-bezier(.4, 0, 1, .8)";   // accelerates: the entry's mirror image

/** Visual centre of a card box that sits one card height above its place, tilted `ENTRY_TILT_DEG` around its bottom centre. */
function exitedCentre(card: Box) {
  const angle = (ENTRY_TILT_DEG * Math.PI) / 180;
  return {
    x: card.left + card.width / 2 + (card.height / 2) * Math.sin(angle),
    y: card.top - (card.height / 2) * Math.cos(angle),
  };
}

/**
 * Keyframes for the clone's flight from the sleeve to the tray. `from` is the card at rest in
 * its sleeve (the clone is laid out there at its own size) and `target` the box it shrinks
 * into. It starts exactly on the card's exit pose (the last frame of the rise, which is the
 * entry's first frame) and ends on `target`, decelerating, with an arc elevated in proportion
 * to the distance and a tilt that returns to 0. Pure: used by the animation and its tests.
 */
export function buildReturnKeyframes(from: Box, target: Box): { keyframes: Keyframe[]; duration: number } {
  const endX = from.width ? target.width / from.width : 1;
  const endY = from.height ? target.height / from.height : 1;
  const start = exitedCentre(from);
  const end = { x: target.left + target.width / 2, y: target.top + target.height / 2 };
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const arc = Math.min(160, Math.max(24, distance * 0.2));
  const direction = Math.abs(end.x - start.x) < 4 ? 0 : Math.sign(end.x - start.x);
  const tilt = direction * Math.min(8, Math.max(2, distance / 90));
  const ease = cubicBezier(...FLIGHT_EASING);
  const place = (centre: { x: number; y: number }, scaleX: number, scaleY: number, rotate: number) => {
    const angle = (rotate * Math.PI) / 180; const halfX = (scaleX * from.width) / 2; const halfY = (scaleY * from.height) / 2;
    return { x: centre.x - (halfX * Math.cos(angle) - halfY * Math.sin(angle)) - from.left, y: centre.y - (halfX * Math.sin(angle) + halfY * Math.cos(angle)) - from.top };
  };
  const frame = (offset: number, at: { x: number; y: number }, scaleX: number, scaleY: number, rotate: number, shadow: string, easing: string): Keyframe =>
    ({ offset, transform: `translate(${at.x}px, ${at.y}px) rotate(${rotate}deg) scale(${scaleX}, ${scaleY})`, boxShadow: shadow, easing });

  const keyframes: Keyframe[] = [frame(0, entryStart(from, from), 1, 1, ENTRY_TILT_DEG, SHADOW_NONE, "linear")];
  for (let sample = 1; sample <= SAMPLES; sample++) {
    const progress = ease(sample / SAMPLES);
    const swell = 1 + (LIFT_SCALE - 1) * Math.sin(Math.PI * progress);       // a hand lifting it a little mid-way
    const scaleX = (1 + (endX - 1) * progress) * swell;
    const scaleY = (1 + (endY - 1) * progress) * swell;
    const rotate = ENTRY_TILT_DEG * (1 - progress) + tilt * Math.sin(Math.PI * progress);
    const centre = { x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress - arc * 4 * progress * (1 - progress) };
    const last = sample === SAMPLES;
    keyframes.push(frame(sample / SAMPLES, place(last ? end : centre, last ? endX : scaleX, last ? endY : scaleY, last ? 0 : rotate),
      last ? endX : scaleX, last ? endY : scaleY, last ? 0 : rotate, last ? SHADOW_NONE : SHADOW_RAISED, "linear"));
  }
  return { keyframes, duration: RETURN_MS };
}

/**
 * Taking a card out, in four beats: (1) the real card slides up out of its sleeve, behind the
 * front plastic (`EXIT_MS`); (2) at its last frame `onLaunch` runs and, in the same task, the
 * real card is hidden and a clone takes its place; (3) the clone flies in an arc to
 * `target()` (`RETURN_MS`); (4) `onLand` runs and the clone is removed. Cancelling at any beat
 * removes the clone and gives the real card back its look. `target` is resolved at launch,
 * so a tray that changed meanwhile is respected; null skips the flight.
 */
export async function exitCard(
  origin: FlightOrigin, target: () => Box | null,
  { signal, onLaunch, onLand }: { signal?: AbortSignal; onLaunch?: () => void; onLand?: () => void } = {},
): Promise<FlightResult> {
  const { ghost, element } = origin;
  if (typeof element.animate !== "function" || typeof ghost.animate !== "function" || signal?.aborted) return signal?.aborted ? "cancelled" : "skipped";
  const previous = element.style.visibility;
  const rise = element.animate([{ transform: "translateY(0) rotate(0deg)" }, { transform: `translateY(-100%) rotate(${ENTRY_TILT_DEG}deg)` }],
    { duration: EXIT_MS, easing: EXIT_EASING, fill: "forwards" });
  const stopRise = () => rise.cancel();
  signal?.addEventListener("abort", stopRise, { once: true });
  let flight: Animation | null = null;
  let stopFlight: (() => void) | null = null;
  try {
    try { await rise.finished; } catch { return "cancelled"; }
    if (signal?.aborted) return "cancelled";
    const to = target();
    // The hand-off, in one task: the real card is hidden, the clone appears at the same pose.
    const from: Box = { ...origin.rect, left: origin.rect.left - window.scrollX, top: origin.rect.top - window.scrollY };
    element.style.visibility = "hidden";
    onLaunch?.();
    if (!to) return "skipped";
    ghost.classList.add("pv-flight");
    ghost.setAttribute("aria-hidden", "true");
    Object.assign(ghost.style, {
      position: "fixed", left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`,
      margin: "0", zIndex: "60", pointerEvents: "none", transformOrigin: "0 0",
    });
    document.body.appendChild(ghost);
    const { keyframes, duration } = buildReturnKeyframes(from, to);
    flight = ghost.animate(keyframes, { duration, easing: "linear", fill: "forwards" });
    stopFlight = () => flight?.cancel();
    signal?.addEventListener("abort", stopFlight, { once: true });
    try { await flight.finished; } catch { return "cancelled"; }
    if (signal?.aborted) return "cancelled";
    onLand?.();
    return "completed";
  } finally {
    signal?.removeEventListener("abort", stopRise);
    if (stopFlight) signal?.removeEventListener("abort", stopFlight);
    ghost.remove();
    rise.cancel();
    element.style.visibility = previous;
  }
}
