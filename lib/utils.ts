import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges conditional class names and resolves conflicting Tailwind utilities so the
 * last-specified utility wins. Every UI primitive funnels its `className` prop through
 * this, which is what lets a caller override a variant's padding or colour inline.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
