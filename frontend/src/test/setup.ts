import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

/**
 * The session is revalidated on return only after 30 s away or 60 s since the last check (auth/store.ts).
 * Tests that dispatch focus, pageshow or visibilitychange mean "the user came back much later", so the
 * test clock jumps two minutes whenever such an event is dispatched (this listener runs before the app's).
 * Tests of the throttle itself use the store directly and are not affected.
 */
let jump = 0;
const realNow = Date.now.bind(Date);
beforeEach(() => { jump = 0; vi.spyOn(Date, "now").mockImplementation(() => realNow() + jump); });
const comeBack = () => { jump += 120_000; };
window.addEventListener("focus", comeBack, true);
window.addEventListener("pageshow", comeBack, true);
document.addEventListener("visibilitychange", comeBack, true);

afterEach(() => {
  cleanup();
  localStorage.clear();
});
