import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildFlightKeyframes, captureOrigin, cubicBezier, DESCENT_MS, ENTRY_TILT_DEG, entryStart, FLIGHT_EASING, FLIGHT_MS, flyCard, LIFT_MS, LIFT_SCALE,
  settled, TOTAL_FLIGHT_MS, type Box,
} from "./flight";

afterEach(() => {
  document.body.innerHTML = "";
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  Object.defineProperty(window, "scrollX", { configurable: true, value: 0 });
});

const box = (left: number, top: number, width = 60, height = 84): Box => ({ left, top, width, height });
const parse = (frame: Keyframe) => {
  const text = String(frame.transform);
  const translate = /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\)/.exec(text)!;
  const scale = /scale\((-?[\d.e-]+), (-?[\d.e-]+)\)/.exec(text)!;
  return { x: Number(translate[1]), y: Number(translate[2]), rotate: Number(/rotate\((-?[\d.e-]+)deg\)/.exec(text)![1]), sx: Number(scale[1]), sy: Number(scale[2]) };
};
/** Where a point (px, py) of the clone (laid out at `from` with the card's size, origin top left) ends up on screen. */
const mapPoint = (frame: Keyframe, from: Box, px: number, py: number) => {
  const { x, y, rotate, sx, sy } = parse(frame);
  const angle = (rotate * Math.PI) / 180; const qx = px * sx; const qy = py * sy;
  return { x: from.left + x + qx * Math.cos(angle) - qy * Math.sin(angle), y: from.top + y + qx * Math.sin(angle) + qy * Math.cos(angle) };
};

describe("flight keyframes", () => {
  const from = box(700, 600, 48, 66); const card = box(100, 300, 180, 248);
  const { keyframes, duration } = buildFlightKeyframes(from, card);
  const centre = (frame: Keyframe) => mapPoint(frame, from, card.width / 2, card.height / 2);

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

  test("it starts exactly on the picked card", () => {
    const first = keyframes[0];
    expect(mapPoint(first, from, 0, 0)).toEqual({ x: from.left, y: from.top });
    const corner = mapPoint(first, from, card.width, card.height);
    expect(corner.x).toBeCloseTo(from.left + from.width, 5);
    expect(corner.y).toBeCloseTo(from.top + from.height, 5);
    expect(String(first.boxShadow)).toMatch(/^0 0 0 .* 0%/);
  });

  test("lift: the card rises a little to 1.06 around its centre and the shadow grows", () => {
    const [rest, lifted] = keyframes;
    expect(parse(lifted).sx / parse(rest).sx).toBeCloseTo(LIFT_SCALE, 5);
    expect(lifted.offset).toBeCloseTo(LIFT_MS / duration, 5);
    expect(centre(lifted).x).toBeCloseTo(centre(rest).x, 5);
    expect(centre(lifted).y).toBeLessThan(centre(rest).y);
    expect(String(lifted.boxShadow)).toMatch(/18px 32px/);
  });

  test("flight: the path is a curve elevated above the straight line, in proportion to the distance", () => {
    const elevation = (frames: Keyframe[], at: (frame: Keyframe) => { x: number; y: number }) => {
      const a = at(frames[0]); const b = at(frames.at(-1)!);
      return Math.max(...frames.slice(1, -1).map((frame) => {
        const p = at(frame); const t = (p.x - a.x) / (b.x - a.x || 1);
        return (a.y + (b.y - a.y) * t) - p.y;  // positive = above the straight line
      }));
    };
    const flight = keyframes.slice(1, -1);
    const high = elevation(flight, centre);
    expect(high).toBeGreaterThan(20);
    // A shorter trip arcs less.
    const nearCard = box(560, 650, 180, 248);
    const short = buildFlightKeyframes(from, nearCard).keyframes;
    const shortHigh = elevation(short.slice(1, -1), (frame) => mapPoint(frame, from, nearCard.width / 2, nearCard.height / 2));
    expect(shortHigh).toBeGreaterThan(0);
    expect(shortHigh).toBeLessThan(high);
    // The apex is mid-way, not at the ends.
    const ys = flight.map((frame) => centre(frame).y);
    const apex = ys.indexOf(Math.min(...ys));
    expect(apex).toBeGreaterThan(1);
    expect(apex).toBeLessThan(flight.length - 2);
  });

  test("flight: a slight tilt toward the direction of travel, ending on the −2° entry tilt", () => {
    const tilts = keyframes.map((frame) => parse(frame).rotate);
    expect(tilts[0]).toBe(0);
    expect(tilts.at(-1)).toBe(ENTRY_TILT_DEG);
    expect(ENTRY_TILT_DEG).toBe(-2);
    expect(Math.min(...tilts)).toBeLessThan(-3);          // travels left → tilts left (negative)
    expect(Math.min(...tilts)).toBeGreaterThanOrEqual(-11);
    const rightwards = buildFlightKeyframes(box(100, 600), box(700, 100, 180, 248)).keyframes.map((frame) => parse(frame).rotate);
    expect(Math.max(...rightwards)).toBeGreaterThan(1);
    expect(rightwards.at(-1)).toBe(ENTRY_TILT_DEG);
  });

  test("flight: it decelerates toward the opening", () => {
    const flat = buildFlightKeyframes(box(0, 600), box(800, 600, 60, 84)).keyframes;
    const liftEnd = LIFT_MS / duration; const landing = (LIFT_MS + FLIGHT_MS) / duration;
    const at = (fraction: number) => mapPoint(flat.reduce((best, frame) =>
      Math.abs((frame.offset as number) - (liftEnd + (landing - liftEnd) * fraction)) < Math.abs((best.offset as number) - (liftEnd + (landing - liftEnd) * fraction)) ? frame : best), box(0, 600), 30, 42).x;
    expect(at(0.25) - at(0)).toBeGreaterThan(at(1) - at(0.75));
    expect(FLIGHT_EASING).toEqual([0.22, 0.61, 0.36, 1]);
  });

  test("the flight ends hovering just over the sleeve's opening, in line with the pocket", () => {
    const hover = keyframes.at(-2)!;
    expect(hover.offset).toBeCloseTo((LIFT_MS + FLIGHT_MS) / duration, 5);
    expect(centre(hover).x).toBeCloseTo(card.left + card.width / 2, 5);
    const bottom = Math.max(...[[0, 0], [card.width, 0], [0, card.height], [card.width, card.height]].map(([px, py]) => mapPoint(hover, from, px, py).y));
    expect(bottom).toBeLessThan(card.top);           // even its lowest (tilted) corner is above the opening…
    expect(bottom).toBeGreaterThan(card.top - 20);   // …and only just
    expect(parse(hover).sx).toBeCloseTo(LIFT_SCALE, 5);
  });

  test("descent: it ends exactly on the real card's first entry frame (one card above its place, −2°, no shadow)", () => {
    const final = keyframes.at(-1)!;
    expect(parse(final)).toMatchObject({ sx: 1, sy: 1, rotate: ENTRY_TILT_DEG });
    expect({ x: parse(final).x, y: parse(final).y }).toEqual(entryStart(from, card));
    // `translateY(-100%) rotate(-2deg)` around the card's bottom centre, checked point by point.
    const angle = (ENTRY_TILT_DEG * Math.PI) / 180;
    const entry = (px: number, py: number) => {
      const ox = card.width / 2; const oy = card.height;
      return { x: card.left + ox + (px - ox) * Math.cos(angle) - (py - oy) * Math.sin(angle), y: card.top - card.height + oy + (px - ox) * Math.sin(angle) + (py - oy) * Math.cos(angle) };
    };
    for (const [px, py] of [[0, 0], [card.width, 0], [0, card.height], [card.width, card.height], [card.width / 2, card.height]]) {
      const clone = mapPoint(final, from, px, py); const real = entry(px, py);
      expect(clone.x).toBeCloseTo(real.x, 6);
      expect(clone.y).toBeCloseTo(real.y, 6);
    }
    // Its bottom centre sits on the opening.
    expect(mapPoint(final, from, card.width / 2, card.height).y).toBeCloseTo(card.top, 6);
    expect(String(final.boxShadow)).toMatch(/^0 0 0 .* 0%/);
  });

  test("every frame has the same transform list, so each function interpolates on its own", () => {
    for (const frame of keyframes) expect(String(frame.transform)).toMatch(/^translate\(\S+px, \S+px\) rotate\(\S+deg\) scale\(\S+, \S+\)$/);
  });

  test("the bezier helper matches the CSS curve", () => {
    const ease = cubicBezier(...FLIGHT_EASING);
    expect(ease(0)).toBe(0); expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeGreaterThan(0.5);
    expect(ease(0.3)).toBeLessThan(ease(0.6));
  });
});

describe("flyCard", () => {
  const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
  function setup() {
    const original = document.createElement("div");
    original.style.visibility = "visible";
    document.body.appendChild(original);
    const destination = document.createElement("div");
    document.body.appendChild(destination);
    let finish!: () => void; let reject!: (error: unknown) => void;
    const finished = new Promise<void>((resolve, fail) => { finish = resolve; reject = fail; });
    const animate = vi.fn(() => ({ finished, cancel: () => reject(new DOMException("cancelled", "AbortError")) }));
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: animate });
    return { original, destination, animate, finish };
  }

  test("hides the original (kept in the layout) while the clone flies, then restores it and removes the clone", async () => {
    const { original, destination, animate, finish } = setup();
    const origin = captureOrigin(original)!;
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

  test("the clone starts where the card was clicked even if the page scrolled since, laid out at the destination's size", async () => {
    const { original, destination } = setup();
    vi.spyOn(original, "getBoundingClientRect").mockReturnValue(rect(40, 700, 48, 66));
    vi.spyOn(destination, "getBoundingClientRect").mockReturnValue(rect(300, 120, 180, 248));
    Object.defineProperty(window, "scrollY", { configurable: true, value: 100 });
    const origin = captureOrigin(original)!;
    expect(origin.rect).toEqual({ left: 40, top: 800, width: 48, height: 66 });   // document coordinates
    // The view scrolls 500 px down to the pocket before the flight.
    Object.defineProperty(window, "scrollY", { configurable: true, value: 600 });
    void flyCard(origin, destination);
    expect(origin.ghost.style.left).toBe("40px");
    expect(origin.ghost.style.top).toBe("200px");    // 700 − 500: where the card now is on screen
    expect(origin.ghost.style.width).toBe("180px");
    expect(origin.ghost.style.height).toBe("248px");
  });

  test("on landing, onLand runs before the clone is removed; never when cancelled", async () => {
    const { original, destination, finish } = setup();
    const seen: number[] = [];
    const done = flyCard(captureOrigin(original)!, destination, { onLand: () => seen.push(document.body.querySelectorAll(".pv-flight").length) });
    finish();
    expect(await done).toBe("completed");
    expect(seen).toEqual([1]);                       // the clone was still there: both change in one task
    const again = setup(); const control = new AbortController(); const onLand = vi.fn();
    const cancelled = flyCard(captureOrigin(again.original)!, again.destination, { signal: control.signal, onLand });
    control.abort();
    expect(await cancelled).toBe("cancelled");
    expect(onLand).not.toHaveBeenCalled();
  });

  test("a cancelled flight removes the clone and makes the original visible again", async () => {
    const { original, destination } = setup();
    const control = new AbortController();
    const done = flyCard(captureOrigin(original)!, destination, { signal: control.signal });
    expect(original.style.visibility).toBe("hidden");
    control.abort();
    expect(await done).toBe("cancelled");
    expect(document.body.querySelector(".pv-flight")).toBeNull();
    expect(original.style.visibility).toBe("visible");
  });

  test("an already cancelled signal never creates a clone or hides the original", async () => {
    const { original, destination, animate } = setup();
    const control = new AbortController(); control.abort();
    expect(await flyCard(captureOrigin(original)!, destination, { signal: control.signal })).toBe("cancelled");
    expect(animate).not.toHaveBeenCalled();
    expect(document.body.querySelector(".pv-flight")).toBeNull();
    expect(original.style.visibility).toBe("visible");
  });

  test("without the Web Animations API nothing is hidden or added", async () => {
    const original = document.createElement("div"); document.body.appendChild(original);
    expect(await flyCard(captureOrigin(original)!, document.createElement("div"))).toBe("skipped");
    expect(original.style.visibility).toBe("");
    expect(document.body.querySelector(".pv-flight")).toBeNull();
  });

  test("settled waits for a smooth scroll to end before the flight measures the pocket", async () => {
    const element = document.createElement("div");
    const tops = [400, 300, 200, 120, 120, 120, 120, 120];
    const spy = vi.spyOn(element, "getBoundingClientRect").mockImplementation(() => rect(0, tops[Math.min(spy.mock.calls.length - 1, tops.length - 1)], 10, 10));
    await settled(element);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(7);   // kept checking until three still reads
    expect(element.getBoundingClientRect().top).toBe(120);
  });
});
