import type { ReactNode } from "react";

import { AutoResize } from "@/components/embed/auto-resize";

export default function EmbedLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[var(--paper)]">
      <AutoResize>{children}</AutoResize>
    </div>
  );
}
