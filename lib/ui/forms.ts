"use client";

import { useForm, type DefaultValues, type FieldValues, type Path, type UseFormSetError } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import type { z } from "zod";

import type { ApiFailure } from "@/lib/http/client";

/**
 * A form validated by the *same* Zod schema its API route validates with.
 *
 * Client and server previously disagreed by construction: routes enforced slug patterns, date
 * ordering and currency length via Zod, while the forms enforced only `required`. A user learned
 * about every other rule by submitting and reading a generic sentence. Sharing the schema means
 * a rule can only be stated once.
 */
export function useZodForm<Schema extends z.ZodType<FieldValues, FieldValues>>(
  schema: Schema,
  defaultValues?: DefaultValues<z.input<Schema>>,
) {
  return useForm<z.input<Schema>, unknown, z.output<Schema>>({
    resolver: standardSchemaResolver(schema),
    defaultValues,
    mode: "onBlur",
  });
}

/**
 * Pushes an API failure's per-field messages onto the matching form controls.
 *
 * Routes have always returned this detail; no client ever read it, so "stallNumber must be at
 * most 40 characters" arrived as "Invalid stall details". Returns true when at least one message
 * landed on a field, letting the caller skip a redundant toast — the inline messages are already
 * pointing at the problem.
 */
export function applyApiErrors<Values extends FieldValues>(
  failure: ApiFailure,
  setError: UseFormSetError<Values>,
): boolean {
  let applied = false;

  for (const [path, messages] of Object.entries(failure.fieldErrors ?? {})) {
    const message = messages?.[0];
    if (!message) continue;
    setError(path as Path<Values>, { type: "server", message });
    applied = true;
  }

  // A root-level failure (a schema `.refine`, or a conflict such as a duplicate stall number)
  // has no field to attach to, so it goes to the form-level slot that forms render above their
  // submit button.
  const rootMessage = failure.formErrors?.[0] ?? (applied ? undefined : failure.error);
  if (rootMessage) setError("root" as Path<Values>, { type: "server", message: rootMessage });

  return applied;
}
