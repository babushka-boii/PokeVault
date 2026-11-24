import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildFlightKeyframes, captureOrigin, cubicBezier, DESCENT_MS, FLIGHT_EASING, FLIGHT_MS, flyCard, HOVER_RATIO, LIFT_MS, LIFT_SCALE, TOTAL_FLIGHT_MS,
  type Box,
} from "./flight";

afterEach(() => { document.body.innerHTML = ""; delete (HTMLElement.prototype as Partial<HTMLElement>).animate; });

const box = (left: number, top: number, width = 60, height = 84): Box => ({ left, top, width, height });
const translateOf = (frame: Keyframe) => {
  const match = /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\)/.exec(String(frame.transform))!;
  return { x: Number(match[1]), y: Number(match[2]) };
};
const rotationOf = (frame: Keyframe) => Number(/rotate\((-?[\d.e-]+)deg\)/.exec(String(frame.transform))![1]);
const scaleOf = (frame: Keyframe) => Number(/scale\((-?[\d.e-]+),/.exec(String(frame.transform))![1]);

describe("flight keyframes", () => {
  const from = box(700, 600); const to = box(100, 100, 180, 252);
  const { keyframes, duration } = buildFlightKeyframes(from, to);

  test("one animation of about 850 ms: 150 ms lift, 550 ms curved flight, 150 ms descent", () => {
    expect([LIFT_MS, FLIGHT_MS, DESCENT_MS]).toEqual([150, 550, 150]);
    expect(duration).toBe(TOTAL_FLIGHT_MS);
    expect(duration).toBe(850);
    const offsets = keyframes.map((frame) => frame.offset as number);
    expect(offsets[0]).toBe(0);
    expect(offsets.at(-1)).toBe(1);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect(new Set(offsets).size).toBe(offsets.length);
    expect(offsets).toContainEqual(LIFT_MS / duration);
    expect(offsets).toContainEqual((LIFT_MS + FLIGHT_MS) / duration);
  });

  test("lift: the card rises a little to 1.06 and the shadow grows", () => {
    const [rest, lifted] = keyframes;
    expect(scaleOf(rest)).toBe(1);
    expect(scaleOf(lifted)).toBeCloseTo(LIFT_SCALE, 5);
    expect(translateOf(lifted).y).toBeLessThan(0);
    expect(lifted.offset).toBeCloseTo(LIFT_MS / duration, 5);
    expect(String(lifted.boxShadow)).not.toBe(String(rest.boxShadow));
    expect(String(lifted.boxShadow)).toMatch(/18px 32px/);
    expect(String(rest.boxShadow)).toMatch(/2px 6px/);
  });

  test("flight: the path is a curve elevated above the straight line, in proportion to the distance", () => {
    const flight = keyframes.slice(2, -1);
    const start = translateOf(keyframes[1]); const end = translateOf(keyframes.at(-1)!);
    const elevation = (frames: Keyframe[], a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(...frames.map((frame) => {
      const p = translateOf(frame);
      const t = (p.x - a.x) / (b.x - a.x || 1);
      return (a.y + (b.y - a.y) * t) - p.y;  // positive = above the straight line
    }));
    const high = elevation(flight, start, end);
    expect(high).toBeGreaterThan(20);
    // A shorter trip arcs less.
    const short = buildFlightKeyframes(from, box(560, 560, 60, 84)).keyframes;
    const shortHigh = elevation(short.slice(2, -1), translateOf(short[1]), translateOf(short.at(-1)!));
    expect(shortHigh).toBeGreaterThan(0);
    expect(shortHigh).toBeLessThan(high);
    // The apex is mid-way, not at the ends.
    const apex = flight.map((frame) => translateOf(frame).y).indexOf(Math.min(...flight.map((frame) => translateOf(frame).y)));
    expect(apex).toBeGreaterThan(1);
    expect(apex).toBeLessThan(flight.length - 2);
  });

  test("flight: a slight tilt toward the direction of travel that returns to 0 on arrival", () => {
    const tilts = keyframes.map(rotationOf);
    expect(tilts[0]).toBe(0);
    expect(tilts.at(-1)).toBe(0);
    expect(Math.min(...tilts)).toBeLessThan(0);          // travels left → tilts left (negative)
    expect(Math.min(...tilts)).toBeGreaterThanOrEqual(-9);
    expect(Math.max(...tilts)).toBe(0);
    const rightwards = buildFlightKeyframes(box(100, 600), box(700, 100)).keyframes.map(rotationOf);
    expect(Math.max(...rightwards)).toBeGreaterThan(0);
    expect(rightwards.at(-1)).toBe(0);
  });

  test("flight: it decelerates toward the pocket", () => {
    const horizontal = buildFlightKeyframes(box(0, 300), box(800, 300)).keyframes;
    const liftEnd = LIFT_MS / duration; const landing = (LIFT_MS + FLIGHT_MS) / duration;
    const at = (fraction: number) => translateOf(horizontal.reduce((best, frame) =>
      Math.abs((frame.offset as number) - (liftEnd + (landing - liftEnd) * fraction)) < Math.abs((best.offset as number) - (liftEnd + (landing - liftEnd) * fraction)) ? frame : best)).x;
    expect(at(0.25) - at(0)).toBeGreaterThan(at(1) - at(0.75));
    expect(FLIGHT_EASING).toEqual([0.22, 0.61, 0.36, 1]);
  });

  test("descent: over the pocket it returns to the target scale, no tilt, a smaller shadow, hovering above the sleeve", () => {
    const landing = keyframes.at(-2)!; const final = keyframes.at(-1)!;
    expect(scaleOf(landing)).toBeCloseTo(scaleOf(final) * LIFT_SCALE, 5);
    expect(scaleOf(final)).toBeCloseTo(to.width / from.width, 5);
    expect(rotationOf(final)).toBe(0);
    expect(String(final.boxShadow)).toMatch(/2px 6px/);
    expect(translateOf(final)).toEqual({ x: to.left - from.left, y: to.top - from.top - to.height * HOVER_RATIO });
  });

  test("the bezier helper matches the CSS curve", () => {
    const ease = cubicBezier(...FLIGHT_EASING);
    expect(ease(0)).toBe(0); expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeGreaterThan(0.5);
    expect(ease(0.3)).toBeLessThan(ease(0.6));
  });
});

describe("flyCard", () => {
  function setup() {
    const original = document.createElement("div");
    original.style.visibility = "visible";
    document.body.appendChild(original);
    const destination = document.createElement("div");
    document.body.appendChild(destination);
    const origin = captureOrigin(original)!;
    let finish!: () => void; let reject!: (error: unknown) => void;
    const finished = new Promise<void>((resolve, fail) => { finish = resolve; reject = fail; });
    const animate = vi.fn(() => ({ finished, cancel: () => reject(new DOMException("cancelled", "AbortError")) }));
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: animate });
    return { original, destination, origin, animate, finish };
  }

  test("hides the original (kept in the layout) while the clone flies, then restores it and removes the clone", async () => {
    const { original, destination, origin, animate, finish } = setup();
    const done = flyCard(origin, destination);
    expect(document.body.querySelectorAll(".pv-flight")).toHaveLength(1);
    expect(origin.ghost.style.position).toBe("fixed");
    expect(origin.ghost).toHaveAttribute("aria-hidden", "true");
    expect(original.style.visibility).toBe("hidden");
    expect(original.isConnected).toBe(true);          // not removed from the layout
    expect(animate).toHaveBeenCalledTimes(1);
    finish();
    expect(await done).toBe("completed");
    expect(document.body.querySelector(".pv-flight")).toBeNull();
    expect(original.style.visibility).toBe("visible");
  });

  test("a cancelled flight removes the clone and makes the original visible again", async () => {
    const { original, destination, origin } = setup();
    const control = new AbortController();
    const done = flyCard(origin, destination, control.signal);
    expect(original.style.visibility).toBe("hidden");
    control.abort();
    expect(await done).toBe("cancelled");
    expect(document.body.querySelector(".pv-flight")).toBeNull();
    expect(original.style.visibility).toBe("visible");
  });

  test("an already cancelled signal never creates a clone or hides the original", async () => {
    const { original, destination, origin, animate } = setup();
    const control = new AbortController(); control.abort();
    expect(await flyCard(origin, destination, control.signal)).toBe("cancelled");
    expect(animate).not.toHaveBeenCalled();
    expect(document.body.querySelector(".pv-flight")).toBeNull();
    expect(original.style.visibility).toBe("visible");
  });

  test("without the Web Animations API nothing is hidden or added", async () => {
    const original = document.createElement("div"); document.body.appendChild(original);
    const origin = captureOrigin(original)!;
    expect(await flyCard(origin, document.createElement("div"))).toBe("skipped");
    expect(original.style.visibility).toBe("");
    expect(document.body.querySelector(".pv-flight")).toBeNull();
  });
});
