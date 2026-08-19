"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function EmbedSnippet({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the snippet is
      // still fully visible to select and copy manually.
    }
  }

  return (
    <div className="space-y-2">
      <pre className="overflow-x-auto rounded-md border bg-muted/30 p-3 text-xs">
        <code>{snippet}</code>
      </pre>
      <Button type="button" variant="outline" size="sm" onClick={copy}>
        {copied ? "Copied!" : "Copy snippet"}
      </Button>
    </div>
  );
}
