import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

export type ClaudeEvent =
  | "claude-tasks-changed"
  | "claude-plans-changed"
  | "claude-sessions-changed";

/** Subscribe to a Claude file-watcher event and call `refetch` when it fires. */
export function useClaudeWatcher(event: ClaudeEvent, refetch: () => void) {
  // Keep a stable ref so we never need to re-subscribe when the refetch
  // identity changes (e.g. on every render from TanStack Query).
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  });

  useEffect(() => {
    const unlistenPromise = listen(event, () => refetchRef.current());
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [event]); // stable: only re-subscribes if the event type changes
}
