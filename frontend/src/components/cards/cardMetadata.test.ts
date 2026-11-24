import { afterEach, expect, test, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCardMetadata } from "./cardMetadata";
import { bulbasaurCard } from "../../test/tcgFixtures";

afterEach(() => vi.unstubAllGlobals());
test("bounds metadata concurrency and deduplicates visible printing requests", async () => {
  let active = 0; let maximum = 0;
  const pending: (() => void)[] = [];
  const fetcher = vi.fn((input: string) => new Promise<Response>((resolve) => {
    active++; maximum = Math.max(maximum, active);
    const id = new URL(input).pathname.split("/").pop()!;
    pending.push(() => { active--; resolve(new Response(JSON.stringify({ ...bulbasaurCard, id }))); });
  }));
  vi.stubGlobal("fetch", fetcher);
  const ids = Array.from({ length: 9 }, (_, i) => `base1-${i + 1}`);
  const hook = renderHook(() => useCardMetadata([...ids, ids[0]], "en"));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
  while (pending.length) {
    await act(async () => { const batch = pending.splice(0); batch.forEach((resolve) => resolve()); });
  }
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  expect(fetcher).toHaveBeenCalledTimes(9);
  expect(maximum).toBe(4);
  expect(Object.keys(hook.result.current.cards)).toHaveLength(9);
});
