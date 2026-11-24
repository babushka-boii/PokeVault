/** Local keys written by features that no longer exist (the PC boxes' sound and sprite mode). */
export const RETIRED_PREFERENCE_KEYS = ["pokevault.audio", "pokevault.spriteMode"] as const;

/** Removes retired keys once at start. Blocked or missing storage is ignored. */
export function removeRetiredPreferences(storage: Pick<Storage, "removeItem"> | undefined = safeStorage()) {
  for (const key of RETIRED_PREFERENCE_KEYS) {
    try { storage?.removeItem(key); } catch { /* storage unavailable: nothing to clean */ }
  }
}

function safeStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}
