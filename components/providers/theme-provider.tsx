"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Class-based theming for the whole app.
 *
 * This replaces a media-query block in globals.css that faked dark mode by overriding Tailwind
 * utility class names (`.bg-white { background-color: … }`). That approach broke the moment a
 * screen used a utility the block didn't enumerate, and gave the user no way to choose a theme.
 * With `attribute="class"`, `.dark` lands on <html> for both an explicit choice and the system
 * default, so a single CSS variant drives every component.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
