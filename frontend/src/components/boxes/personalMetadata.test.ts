import { afterEach, expect, test, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { generationGroup, usePersonalMetadata } from "./personalMetadata";
import { bulbasaurCard, pikachuCard } from "../../test/tcgFixtures";

test("derives generation only from every official species association", () => {
  expect(generationGroup(bulbasaurCard)).toBe("1");
  expect(generationGroup(pikachuCard)).toBe("mixed");
  expect(generationGroup({ ...bulbasaurCard, dex_ids: [1, 25] })).toBe("1");
  expect(generationGroup({ ...bulbasaurCard, dex_ids: [] })).toBe("unknown");
  expect(generationGroup({ ...bulbasaurCard, category: "Trainer" })).toBe("Trainer");
  expect(generationGroup({ ...bulbasaurCard, category: "Energy" })).toBe("Energy");
  expect(generationGroup(undefined)).toBe("unknown");
});


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
  const hook = renderHook(() => usePersonalMetadata([...ids, ids[0]], "en"));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
  while (pending.length) {
    await act(async () => { const batch = pending.splice(0); batch.forEach((resolve) => resolve()); });
  }
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  expect(fetcher).toHaveBeenCalledTimes(9);
  expect(maximum).toBe(4);
  expect(Object.keys(hook.result.current.cards)).toHaveLength(9);
});
