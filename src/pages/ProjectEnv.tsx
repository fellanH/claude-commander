import { useState, useEffect } from "react";
import { useOutletContext } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  EyeOff,
  Copy,
  Trash2,
  Plus,
  Loader2,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import type { EnvVar, Project } from "@/types";

export default function ProjectEnv() {
  const { project } = useOutletContext<{ project: Project }>();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const { data: envFiles } = useQuery({
    queryKey: ["env-files", project.path],
    queryFn: () => api.listEnvFiles(project.path),
  });

  // Auto-select first file when data loads
  useEffect(() => {
    if (envFiles && envFiles.length > 0 && !selectedFile) {
      setSelectedFile(envFiles[0].path);
    }
  }, [envFiles, selectedFile]);

  const { data: envVars, refetch: refetchVars } = useQuery({
    queryKey: ["env-vars", selectedFile],
    queryFn: () => api.getEnvVars(selectedFile!),
    enabled: !!selectedFile,
  });

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-lg font-semibold mb-4">Environment Variables</h2>

      {/* File tabs */}
      {envFiles && envFiles.length > 0 ? (
        <div className="flex gap-2 mb-4 flex-wrap">
          {envFiles.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => setSelectedFile(f.path)}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors border ${
                selectedFile === f.path
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-accent/50"
              }`}
            >
              {f.filename}
              <span className="ml-1.5 text-xs opacity-70">({f.var_count})</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center py-8 text-center border border-dashed border-border rounded-lg mb-4">
          <KeyRound className="size-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No .env files found</p>
          <p className="text-xs text-muted-foreground">
            Create a .env file in {project.path}
          </p>
        </div>
      )}

      {/* Vars table */}
      {selectedFile && envVars && (
        <EnvVarTable
          vars={envVars}
          filePath={selectedFile}
          onRefresh={refetchVars}
        />
      )}
    </div>
  );
}

function EnvVarTable({
  vars,
  filePath,
  onRefresh,
}: {
  vars: EnvVar[];
  filePath: string;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const deleteMutation = useMutation({
    mutationFn: (key: string) => api.deleteEnvVar(filePath, key),
    onSuccess: () => {
      toast.success("Variable deleted");
      queryClient.invalidateQueries({ queryKey: ["env-vars", filePath] });
    },
  });

  const setMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.setEnvVar(filePath, key, value),
    onSuccess: () => {
      toast.success("Variable saved");
      queryClient.invalidateQueries({ queryKey: ["env-vars", filePath] });
      setAdding(false);
      setNewKey("");
      setNewValue("");
    },
    onError: () => toast.error("Failed to save variable"),
  });

  const toggleReveal = (key: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const copyToClipboard = (value: string) => {
    navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">
              Key
            </th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">
              Value
            </th>
            <th className="w-20 px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {vars.map((v) => (
            <tr
              key={v.key}
              className="border-b border-border last:border-0 hover:bg-muted/20"
            >
              <td className="px-3 py-2 font-mono text-xs">{v.key}</td>
              <td className="px-3 py-2 font-mono text-xs">
                {v.masked && !revealed.has(v.key)
                  ? "••••••••"
                  : v.value || (
                      <span className="text-muted-foreground">(empty)</span>
                    )}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1 justify-end">
                  {v.masked && (
                    <button
                      type="button"
                      onClick={() => toggleReveal(v.key)}
                      className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                    >
                      {revealed.has(v.key) ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => copyToClipboard(v.value)}
                    className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(v.key)}
                    disabled={deleteMutation.isPending}
                    className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}

          {/* Add row */}
          {adding && (
            <tr className="border-b border-border bg-muted/10">
              <td className="px-3 py-2">
                <input
                  autoFocus
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="KEY_NAME"
                  className="w-full font-mono text-xs bg-transparent border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="value"
                  className="w-full font-mono text-xs bg-transparent border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newKey) {
                      setMutation.mutate({ key: newKey, value: newValue });
                    }
                    if (e.key === "Escape") setAdding(false);
                  }}
                />
              </td>
              <td className="px-3 py-2">
                <Button
                  size="sm"
                  onClick={() =>
                    newKey &&
                    setMutation.mutate({ key: newKey, value: newValue })
                  }
                  disabled={!newKey || setMutation.isPending}
                >
                  {setMutation.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    "Save"
                  )}
                </Button>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="p-2 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAdding(true)}
          className="text-xs w-full"
        >
          <Plus className="size-3.5 mr-1" />
          Add variable
        </Button>
      </div>
    </div>
  );
}
