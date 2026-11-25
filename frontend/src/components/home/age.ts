export type Age = { unit: "lessThanHour" } | { unit: "hours"; count: number } | { unit: "days"; count: number };

/** How old a price is: under an hour, whole hours up to 47 h, then whole days. A clock slightly ahead counts as fresh. */
export function priceAge(updatedAt: string, now: number): Age {
  const hours = Math.floor((now - Date.parse(updatedAt)) / 3_600_000);
  if (hours < 1) return { unit: "lessThanHour" };
  if (hours < 48) return { unit: "hours", count: hours };
  return { unit: "days", count: Math.floor(hours / 24) };
}

/** The first word of the account name, or "" when it has none. */
export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? "";
}
