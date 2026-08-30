"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/**
 * One labelled form control, with its description and validation message.
 *
 * Wiring `id`, `aria-invalid` and `aria-describedby` by hand at every call site is the reason
 * accessible forms drift: one field gets it, the next twenty don't. Field injects all three into
 * its single child element, so a control is always announced with its label, its hint, and — the
 * moment validation fails — its error, without the caller thinking about it.
 *
 *   <Field label="Company name" error={errors.companyName?.message} required>
 *     <Input {...register("companyName")} />
 *   </Field>
 */
export function Field({
  label,
  error,
  description,
  required = false,
  className,
  children,
  htmlFor,
}: {
  label?: React.ReactNode;
  error?: React.ReactNode;
  description?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
  /** Escape hatch for a control that manages its own id (a Radix trigger, for instance). */
  htmlFor?: string;
}) {
  const generatedId = React.useId();
  const controlId = htmlFor ?? generatedId;
  const descriptionId = `${controlId}-description`;
  const errorId = `${controlId}-error`;
  const invalid = Boolean(error);

  const describedBy =
    [description ? descriptionId : null, invalid ? errorId : null].filter(Boolean).join(" ") || undefined;

  // Only a single element child can be wired up; anything else renders untouched so a caller
  // composing something unusual is never silently broken.
  const control =
    React.isValidElement(children) && !htmlFor
      ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
          id: (children.props as Record<string, unknown>).id ?? controlId,
          "aria-invalid": invalid || undefined,
          "aria-describedby": describedBy,
        })
      : children;

  return (
    <div data-slot="field" data-invalid={invalid || undefined} className={cn("group/field space-y-1.5", className)}>
      {label && (
        <Label htmlFor={controlId}>
          {label}
          {required && (
            <span className="text-[var(--status-booked-ink)]" aria-hidden>
              *
            </span>
          )}
        </Label>
      )}
      {control}
      {description && (
        <p id={descriptionId} className="text-xs text-[var(--ink-faint)]">
          {description}
        </p>
      )}
      {invalid && (
        <p id={errorId} role="alert" className="text-xs font-medium text-[var(--status-booked-ink)]">
          {error}
        </p>
      )}
    </div>
  );
}

/** Responsive grid for related fields. `columns` is the widescreen count; always 1 on mobile. */
export function FieldGroup({
  columns = 1,
  className,
  ...props
}: React.ComponentProps<"div"> & { columns?: 1 | 2 | 3 }) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "grid gap-4",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
      {...props}
    />
  );
}

/** Groups fields under a caption, e.g. "Contact details". */
export function FieldSet({
  legend,
  description,
  className,
  children,
  ...props
}: React.ComponentProps<"fieldset"> & { legend?: React.ReactNode; description?: React.ReactNode }) {
  return (
    <fieldset data-slot="field-set" className={cn("space-y-4", className)} {...props}>
      {legend && (
        <legend className="font-display text-sm font-semibold text-[var(--ink)]">{legend}</legend>
      )}
      {description && <p className="text-sm text-[var(--ink-soft)]">{description}</p>}
      {children}
    </fieldset>
  );
}
