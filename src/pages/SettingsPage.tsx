import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Save, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import type { AppSettings } from "@/types";
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";

type UpdateState =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "error";

export default function SettingsPage() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const [form, setForm] = useState<AppSettings>({
    scan_path: null,
    theme: "system",
    terminal: "auto",
    onboarding_completed: false,
    github_close_prompt: true,
  });

  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (s: AppSettings) => api.updateSettings(s),
    onSuccess: () => toast.success("Settings saved"),
    onError: () => toast.error("Failed to save settings"),
  });

  const { data: currentVersion } = useQuery({
    queryKey: ["appVersion"],
    queryFn: getVersion,
  });

  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateObj, setUpdateObj] = useState<Awaited<
    ReturnType<typeof check>
  > | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleCheckForUpdates() {
    setUpdateState("checking");
    setErrorMsg(null);
    try {
      const update = await check();
      if (update?.available) {
        setUpdateVersion(update.version);
        setUpdateObj(update);
        setUpdateState("available");
      } else {
        setUpdateState("upToDate");
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setUpdateState("error");
    }
  }

  async function handleDownloadAndInstall() {
    if (!updateObj) return;
    setUpdateState("downloading");
    setProgress(0);
    try {
      let downloaded = 0;
      let total = 0;
      await updateObj.download((event: DownloadEvent) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setProgress(total > 0 ? Math.round((downloaded / total) * 100) : -1);
        }
      });
      await updateObj.install();
      await relaunch();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setUpdateState("error");
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-xl font-bold mb-6">Settings</h1>

      <div className="space-y-6">
        <div className="border border-border rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold">General</h2>

          <div>
            <label className="text-sm font-medium block mb-1">
              Projects Scan Path
            </label>
            <input
              type="text"
              value={form.scan_path ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, scan_path: e.target.value || null }))
              }
              placeholder="~/cv"
              className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Directory to scan for projects
            </p>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Theme</label>
            <select
              value={form.theme}
              onChange={(e) =>
                setForm((f) => ({ ...f, theme: e.target.value }))
              }
              className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">
              Preferred Terminal
            </label>
            <select
              value={form.terminal}
              onChange={(e) =>
                setForm((f) => ({ ...f, terminal: e.target.value }))
              }
              className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="auto">Auto-detect</option>
              <option value="warp">Warp</option>
              <option value="iterm2">iTerm2</option>
              <option value="terminal">Terminal.app</option>
            </select>
          </div>
        </div>

        <div className="border border-border rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold">GitHub</h2>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.github_close_prompt}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  github_close_prompt: e.target.checked,
                }))
              }
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium">
                Prompt to close linked issue on task completion
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                When a task with a linked GitHub issue is marked complete, offer
                to close the issue automatically via the{" "}
                <span className="font-mono">gh</span> CLI.
              </p>
            </div>
          </label>
        </div>

        <Button
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <Loader2 className="size-4 mr-2 animate-spin" />
          ) : (
            <Save className="size-4 mr-2" />
          )}
          Save Settings
        </Button>

        <div className="border-t border-border pt-6">
          <div className="border border-border rounded-lg p-4 space-y-4">
            <h2 className="text-sm font-semibold">About</h2>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Version{" "}
                <span className="font-mono text-foreground">
                  {currentVersion ?? "…"}
                </span>
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckForUpdates}
                disabled={
                  updateState === "checking" || updateState === "downloading"
                }
              >
                {updateState === "checking" ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5 mr-1.5" />
                )}
                Check for Updates
              </Button>
            </div>

            {updateState === "checking" && (
              <p className="text-sm text-muted-foreground">
                Checking for updates…
              </p>
            )}

            {updateState === "upToDate" && (
              <p className="text-sm text-muted-foreground">
                You're on the latest version.
              </p>
            )}

            {updateState === "available" && (
              <div className="flex items-center justify-between">
                <p className="text-sm">
                  Version{" "}
                  <span className="font-mono font-medium">{updateVersion}</span>{" "}
                  is available.
                </p>
                <Button size="sm" onClick={handleDownloadAndInstall}>
                  Download &amp; Install
                </Button>
              </div>
            )}

            {updateState === "downloading" && (
              <div className="space-y-1.5">
                <p className="text-sm text-muted-foreground">
                  Downloading update…{progress >= 0 ? ` ${progress}%` : ""}
                </p>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-200"
                    style={{ width: progress >= 0 ? `${progress}%` : "100%" }}
                  />
                </div>
              </div>
            )}

            {updateState === "error" && (
              <p className="text-sm text-destructive">{errorMsg}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
