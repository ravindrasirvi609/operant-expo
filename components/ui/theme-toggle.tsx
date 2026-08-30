"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/** No external store to watch — the hook is used purely for its snapshot split. */
const noopSubscribe = () => () => {};

/**
 * True only after hydration has finished.
 *
 * next-themes reads the stored preference synchronously, so the client's first render already
 * knows the real theme while the server's markup cannot. Rendering that difference directly is a
 * hydration mismatch. useSyncExternalStore is the API built for this: React uses the server
 * snapshot for SSR *and* the hydration pass, then re-renders with the client snapshot — no effect
 * writing state, and no divergent markup.
 */
function useHydrated() {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();

  const active = hydrated ? OPTIONS.find((option) => option.value === theme) : undefined;
  const Icon = active?.icon ?? Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="iconSm" aria-label={`Theme: ${active?.label ?? "system"}`}>
          <Icon className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {OPTIONS.map((option) => (
          <DropdownMenuItem key={option.value} onSelect={() => setTheme(option.value)}>
            <option.icon aria-hidden />
            {option.label}
            {hydrated && theme === option.value && (
              <span className="ml-auto text-xs text-[var(--brand-quiet)]">active</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
