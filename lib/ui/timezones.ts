/**
 * Timezone options for exhibition setup.
 *
 * The field was a free-text input defaulting to a hardcoded "Asia/Kolkata", so any typo produced
 * an exhibition whose published dates could not be rendered in the intended zone. A curated list
 * covers the venues an organizer is realistically working in; `resolveTimezoneOptions` prepends
 * the viewer's own zone when it is not already listed, so the sensible default is always present.
 */
export const COMMON_TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Jakarta",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Istanbul",
  "Africa/Johannesburg",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "UTC",
] as const;

/** The viewer's own IANA zone, or UTC where the environment cannot report one. */
export function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function resolveTimezoneOptions(current?: string) {
  const detected = detectTimezone();
  const options = new Set<string>([detected, ...COMMON_TIMEZONES]);
  // A zone loaded from an existing exhibition must stay selectable even if it is not curated.
  if (current) options.add(current);
  return Array.from(options);
}
