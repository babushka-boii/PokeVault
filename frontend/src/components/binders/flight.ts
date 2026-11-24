/**
 * FLIP card flight (8C, reworked in 8C.1): a floating clone (position: fixed) moves like a
 * hand carrying the card from where it was (tray thumbnail or source pocket) to just above
 * its destination pocket, which then plays its in-sleeve entry.
 *
 * One Web Animations API animation carries three phases through keyframe offsets:
 *   1. lift      150 ms  rises a little (scale 1 → 1.06) and the shadow grows
 *   2. flight    550 ms  a curved path (a keyframe elevated above the straight line, in
 *                        proportion to the distance), a slight tilt toward the direction
 *                        of travel that returns to 0, and a deceleration at the end
 *   3. descent   150 ms  over the pocket: back to scale 1 and the shadow shrinks
 * The pocket's entry (≈ 450 ms, CSS) follows: ≈ 1.3 s in total. The keyframes are computed
 * once, and nothing runs frame by frame in JavaScript.
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
export const SCROLL_WAIT_MS = 250;
/** Fraction of the card height the clone hovers above the pocket; the CSS entry starts there too. */
export const HOVER_RATIO = 0.3;
export const LIFT_SCALE = 1.06;
/** Deceleration at the end of the flight. */
export const FLIGHT_EASING = [0.22, 0.61, 0.36, 1] as const;

const LIFT_PX = 8;
const SAMPLES = 12;
const SHADOW_REST = "0 2px 6px color-mix(in srgb, var(--pv-shadow-color) 30%, transparent)";
const SHADOW_RAISED = "0 18px 32px color-mix(in srgb, var(--pv-shadow-color) 55%, transparent)";

export type Box = Pick<DOMRect, "left" | "top" | "width" | "height">;
export type FlightOrigin = { rect: DOMRect; ghost: HTMLElement; element: HTMLElement };
export type FlightResult = "completed" | "cancelled" | "skipped";

/** Captures the card's current box, a detached visual copy and the live element (to hide it). */
export function captureOrigin(element: Element | null | undefined): FlightOrigin | null {
  if (!element) return null;
  return { rect: element.getBoundingClientRect(), ghost: element.cloneNode(true) as HTMLElement, element: element as HTMLElement };
}

export function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export function inViewport(element: Element) {
  const box = element.getBoundingClientRect();
  return box.top >= 0 && box.bottom <= window.innerHeight;
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
 * Keyframes (with offsets) for the whole flight. `from` is the card's box when it was
 * picked up and `to` the destination sleeve. Pure: used by the animation and by its tests.
 */
export function buildFlightKeyframes(from: Box, to: Box): { keyframes: Keyframe[]; duration: number } {
  const targetX = from.width ? to.width / from.width : 1;
  const targetY = from.height ? to.height / from.height : 1;
  const dx = to.left - from.left;
  const dy = to.top - from.top - to.height * HOVER_RATIO;
  const distance = Math.hypot(dx, dy);
  const arc = Math.min(180, Math.max(28, distance * 0.2));
  const direction = Math.abs(dx) < 4 ? 0 : Math.sign(dx);
  const tilt = direction * Math.min(9, Math.max(3, distance / 80));
  const ease = cubicBezier(...FLIGHT_EASING);
  const liftEnd = LIFT_MS / TOTAL_FLIGHT_MS;
  const landing = (LIFT_MS + FLIGHT_MS) / TOTAL_FLIGHT_MS;
  const frame = (x: number, y: number, scaleX: number, scaleY: number, rotate: number, shadow: string, easing?: string): Keyframe =>
    ({ transform: `translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${scaleX}, ${scaleY})`, boxShadow: shadow, ...(easing ? { easing } : {}) });

  const keyframes: Keyframe[] = [{ offset: 0, ...frame(0, 0, 1, 1, 0, SHADOW_REST, "cubic-bezier(.2, .7, .2, 1)") }];
  keyframes.push({ offset: liftEnd, ...frame(0, -LIFT_PX, LIFT_SCALE, LIFT_SCALE, 0, SHADOW_RAISED, "linear") });
  for (let sample = 1; sample <= SAMPLES; sample++) {
    const progress = ease(sample / SAMPLES);  // decelerates toward the pocket
    const lift = Math.sin(Math.PI * Math.min(1, progress));
    keyframes.push({
      offset: liftEnd + (landing - liftEnd) * (sample / SAMPLES),
      ...frame(
        dx * progress,
        -LIFT_PX + (dy + LIFT_PX) * progress - arc * 4 * progress * (1 - progress),
        (1 + (targetX - 1) * progress) * LIFT_SCALE,
        (1 + (targetY - 1) * progress) * LIFT_SCALE,
        tilt * lift,
        SHADOW_RAISED,
        "linear",
      ),
    });
  }
  keyframes.push({ offset: 1, ...frame(dx, dy, targetX, targetY, 0, SHADOW_REST) });
  return { keyframes, duration: TOTAL_FLIGHT_MS };
}

/**
 * Flies the clone to `destination`. Resolves "completed" at the end, "cancelled" when the
 * signal aborts (the animation is cancelled), or "skipped" when animations are unsupported.
 * The original is hidden meanwhile and always restored; the clone is always removed.
 */
export async function flyCard(origin: FlightOrigin, destination: Element, signal?: AbortSignal): Promise<FlightResult> {
  const { rect: from, ghost, element } = origin;
  if (typeof ghost.animate !== "function" || signal?.aborted) return signal?.aborted ? "cancelled" : "skipped";
  const to = destination.getBoundingClientRect();
  ghost.classList.add("pv-flight");
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed", left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`,
    margin: "0", zIndex: "60", pointerEvents: "none", transformOrigin: "top left",
  });
  const previous = element.style.visibility;
  element.style.visibility = "hidden";
  document.body.appendChild(ghost);
  const { keyframes, duration } = buildFlightKeyframes(from, to);
  const animation = ghost.animate(keyframes, { duration, easing: "linear", fill: "forwards" });
  const cancel = () => animation.cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    await animation.finished;
  } catch {
    // Cancelled (a new action, or unmount): the clone is still removed below.
  } finally {
    signal?.removeEventListener("abort", cancel);
    ghost.remove();
    element.style.visibility = previous;
  }
  return signal?.aborted ? "cancelled" : "completed";
}
