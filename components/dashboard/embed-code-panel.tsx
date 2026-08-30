"use client";

import { useState } from "react";

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
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const snippet = open && typeof window !== "undefined" ? buildSnippet(window.location.origin, slug, name) : "";

  async function copy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <button onClick={() => setOpen((value) => !value)} className="rounded-md border border-[var(--line-strong)] px-3 py-2 text-xs font-semibold text-[var(--ink)]">
        {open ? "Hide embed code" : "Get embed code"}
      </button>
      {open && (
        <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--paper)] p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--ink-soft)]">Paste this into your website where you want the booking widget to appear.</p>
            <button onClick={() => void copy()} className="rounded-md bg-[var(--brand)] px-2.5 py-1 text-xs font-semibold text-[var(--brand-ink)]">
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-[var(--paper-raised)] p-3 font-mono text-[11px] leading-relaxed text-[var(--ink)]">{snippet}</pre>
        </div>
      )}
    </div>
  );
}
