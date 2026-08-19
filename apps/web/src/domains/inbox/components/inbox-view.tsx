"use client";

import { useState } from "react";
import { ConversationList } from "@/domains/inbox/components/conversation-list";
import { ConversationThread } from "@/domains/inbox/components/conversation-thread";

export function InboxView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="-m-6 flex flex-1">
      <ConversationList selectedId={selectedId} onSelect={setSelectedId} />
      {selectedId ? (
        <ConversationThread conversationId={selectedId} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Select a conversation, or start a new one.
        </div>
      )}
    </div>
  );
}
