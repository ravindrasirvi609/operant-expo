"use client";

import { useEffect, type ReactNode } from "react";

export const EMBED_RESIZE_MESSAGE_TYPE = "operant-embed-resize";

/**
 * Reports the embed's content height to whatever page has this route in an <iframe>, so the
 * host page's listener script (generated in the dashboard's "Get embed code" panel) can size
 * the iframe to fit — no scrollbars, no guessed fixed height. A no-op when not actually framed
 * (window.parent === window), so this is safe to render even outside an iframe.
 */
export function AutoResize({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (window.parent === window) return;

    function report() {
      window.parent.postMessage({ type: EMBED_RESIZE_MESSAGE_TYPE, height: document.documentElement.scrollHeight }, "*");
    }

    report();
    const observer = new ResizeObserver(report);
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, []);

  return <>{children}</>;
}
