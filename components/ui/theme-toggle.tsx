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

export function ThemeToggle() {
  // next-themes leaves `theme` undefined until it has read the stored preference on the client,
  // which is exactly the signal needed here: server and first client render both fall back to
  // the system icon, so there is nothing to reconcile and no mounted flag to track.
  const { theme, setTheme } = useTheme();
  const active = OPTIONS.find((option) => option.value === theme);
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
            {theme === option.value && <span className="ml-auto text-xs text-[var(--brand-quiet)]">active</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
