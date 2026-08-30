import { z } from "zod";

/**
 * Shared field schemas.
 *
 * Every message here is written to be shown to a user verbatim, because it is: the API returns
 * it as a per-field error and the form renders it under the input. The rules used to live only
 * on the server with messages like "Invalid hall details", so a user who typed a slug with a
 * capital letter had no way to learn what was wrong.
 */

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** URL-safe identifier: lowercase words joined by single hyphens. */
export const slugField = z
  .string()
  .trim()
  .min(2, "Use at least 2 characters.")
  .max(80, "Use at most 80 characters.")
  .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens only — like spring-expo-2027.");

export const emailField = z
  .string()
  .trim()
  .max(254, "That email address is too long.")
  // Piped rather than chained: `z.email().trim()` applies the format check first, so a pasted
  // address with surrounding whitespace was rejected before the trim could rescue it.
  .pipe(z.email("Enter a valid email address, like name@company.com."));

/** ISO 4217 alphabetic code, normalised to uppercase. */
export const currencyField = z
  .string()
  .trim()
  .length(3, "Use a 3-letter currency code, like INR or USD.")
  .regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code, like INR or USD.")
  .transform((value) => value.toUpperCase());

export const passwordField = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(128, "Use at most 128 characters.");

export function requiredText(label: string, { min = 2, max = 160 }: { min?: number; max?: number } = {}) {
  return z
    .string()
    .trim()
    .min(min, min === 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`)
    .max(max, `${label} must be at most ${max} characters.`);
}

export function optionalText(label: string, max: number) {
  return z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters.`)
    .optional()
    // An untouched input submits "", which must mean "absent" rather than "a 0-character value",
    // otherwise optional fields fail min-length rules they were never meant to be held to.
    .transform((value) => (value === "" ? undefined : value));
}

export function positiveNumber(label: string, { max, integer = false }: { max?: number; integer?: boolean } = {}) {
  let schema = z.coerce
    .number({ error: `${label} must be a number.` })
    .positive(`${label} must be greater than zero.`);
  if (integer) schema = schema.int(`${label} must be a whole number.`);
  if (max !== undefined) schema = schema.max(max, `${label} must be at most ${max.toLocaleString()}.`);
  return schema;
}

export function nonNegativeNumber(label: string, { max }: { max?: number } = {}) {
  let schema = z.coerce
    .number({ error: `${label} must be a number.` })
    .nonnegative(`${label} can't be negative.`);
  if (max !== undefined) schema = schema.max(max, `${label} must be at most ${max.toLocaleString()}.`);
  return schema;
}

/** Derives a slug suggestion from a display name, for auto-filling slug inputs. */
export function slugify(value: string) {
  const COMBINING_MARKS_START = 0x0300;
  const COMBINING_MARKS_END = 0x036f;
  return Array.from(value.normalize("NFKD"))
    // Drop combining diacritical marks left by decomposition, so "Munchner Messe" and
    // "Munchner Messe" with an umlaut both slug to the same identifier.
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < COMBINING_MARKS_START || code > COMBINING_MARKS_END;
    })
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
