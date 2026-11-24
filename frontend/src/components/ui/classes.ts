/** Joins class names, skipping empty values. */
export function classes(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}
