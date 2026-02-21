import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

export type ClaudeEvent =
  | "claude-tasks-changed"
  | "claude-plans-changed"
  | "claude-sessions-changed";

/** Subscribe to a Claude file-watcher event and call `refetch` when it fires. */
export function useClaudeWatcher(event: ClaudeEvent, refetch: () => void) {
  useEffect(() => {
    const unlistenPromise = listen(event, () => refetch());
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [event, refetch]);
}
