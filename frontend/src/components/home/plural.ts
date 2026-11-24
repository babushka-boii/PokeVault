/** Picks the `one`/`other` entry for a count and fills `{count}` (and any extra placeholders). */
export function plural(entry: { one: string; other: string }, count: number, extra: Record<string, string> = {}): string {
  let text = (count === 1 ? entry.one : entry.other).replace("{count}", String(count));
  for (const [key, value] of Object.entries(extra)) text = text.replace(`{${key}}`, value);
  return text;
}
