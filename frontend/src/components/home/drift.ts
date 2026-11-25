/** The carousel drifts at this speed, in CSS pixels per second (slow enough to read the cards). */
export const DRIFT_PX_PER_SECOND = 28;
/** After a finger lifts, the drift waits this long before it resumes. */
export const TOUCH_RESUME_MS = 3000;

/**
 * The next offset of a seamless loop. The track holds the list twice, so when the offset
 * reaches the width of one copy it goes back by exactly that width: both halves are
 * identical, so the jump cannot be seen.
 */
export function advance(position: number, elapsedMs: number, loopWidth: number, speed = DRIFT_PX_PER_SECOND): number {
  const next = position + (speed * elapsedMs) / 1000;
  return loopWidth > 0 ? next % loopWidth : next;
}

/** The loop only runs (and the duplicate only exists) when the cards are wider than their viewport. */
export function needsLoop(listWidth: number, viewportWidth: number): boolean {
  return viewportWidth > 0 && listWidth > viewportWidth;
}
