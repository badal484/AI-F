/**
 * Converts "" values to null in a parsed form object — optional text fields
 * are validated as `.optional().or(z.literal(""))` so controlled `<input>`
 * elements can stay controlled, but an empty string should be stored as
 * "no value" (null), not as literal empty text.
 */
export function nullifyEmptyStrings<T extends Record<string, unknown>>(data: T): T {
  const result = { ...data };
  for (const key of Object.keys(result) as (keyof T)[]) {
    if (result[key] === "") {
      result[key] = null as T[keyof T];
    }
  }
  return result;
}
