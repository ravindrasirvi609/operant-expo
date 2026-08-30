"use client";

import * as React from "react";
import { Check, ClipboardCopy, Code2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

function buildSnippet(origin: string, slug: string, name: string) {
  const frameId = `operant-embed-${slug}`;
  return `<!-- ${name} — Operant Expo booking widget -->
<iframe
  id="${frameId}"
  src="${origin}/embed/${slug}"
  title="Book a stall — ${name}"
  style="width:100%;border:0;display:block;min-height:480px;"
  loading="lazy"
></iframe>
<script>
(function () {
  window.addEventListener("message", function (event) {
    if (!event.data || event.data.type !== "operant-embed-resize") return;
    var frames = document.querySelectorAll('iframe[id^="operant-embed-"]');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === event.source) {
        frames[i].style.height = event.data.height + "px";
      }
    }
  });
})();
</script>`;
}

export function EmbedCodePanel({ slug, name }: { slug: string; name: string }) {
  const [copied, setCopied] = React.useState(false);
  // The origin is only readable on the client. Capturing it when the panel is opened — rather
  // than in a mount effect — keeps the server and first client render identical with no extra
  // state transition.
  const [origin, setOrigin] = React.useState("");
  const open = origin !== "";

  const snippet = open ? buildSnippet(origin, slug, name) : "";

  function toggle() {
    setOrigin((current) => (current ? "" : window.location.origin));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast.success("Embed code copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is denied in some browsers and on insecure origins; the snippet is
      // still on screen and selectable, so say that rather than failing silently.
      toast.error("Couldn't copy automatically. Select the code and copy it manually.");
    }
  }

  return (
    <div>
      <Button size="sm" variant="ghost" onClick={toggle} aria-expanded={open}>
        <Code2 aria-hidden />
        {open ? "Hide embed code" : "Get embed code"}
      </Button>

      {open && (
        <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--paper-sunken)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--ink-soft)]">
              Paste this into your website where the booking widget should appear. It resizes itself.
            </p>
            <Button size="sm" onClick={() => void copy()} disabled={!snippet}>
              {copied ? <Check aria-hidden /> : <ClipboardCopy aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-[var(--card)] p-3 font-mono text-[11px] leading-relaxed text-[var(--ink)]">
            {snippet}
          </pre>
        </div>
      )}
    </div>
  );
}
