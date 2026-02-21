import { useOutletContext } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Rocket, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Project } from "@/types";

export default function ProjectDeploy() {
  const { project } = useOutletContext<{ project: Project }>();

  const { data: configs } = useQuery({
    queryKey: ["deploy-configs", project.path],
    queryFn: () => api.getDeployConfigs(project.path),
  });

  if (!configs || configs.length === 0) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">Deploy</h2>
        <div className="flex flex-col items-center py-8 text-center border border-dashed border-border rounded-lg">
          <Rocket className="size-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No deploy configs found
          </p>
          <p className="text-xs text-muted-foreground">
            Add fly.toml or vercel.json to get started
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <h2 className="text-lg font-semibold">Deploy</h2>

      {configs.map((config, i) => (
        <div key={i} className="border border-border rounded-lg p-4">
          <div className="flex items-center gap-3 mb-4">
            <Badge variant={config.kind === "fly" ? "info" : "secondary"}>
              {config.kind === "fly" ? "Fly.io" : "Vercel"}
            </Badge>
            {config.app_name && (
              <span className="font-mono text-sm">{config.app_name}</span>
            )}
            {config.region && (
              <span className="text-xs text-muted-foreground">
                {config.region}
              </span>
            )}
          </div>

          <div className="space-y-1">{renderConfigFields(config.raw)}</div>

          <div className="mt-4 flex gap-2">
            {config.kind === "fly" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open("https://fly.io/dashboard")}
              >
                <ExternalLink className="size-3.5 mr-2" />
                Fly Dashboard
              </Button>
            )}
            {config.kind === "vercel" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open("https://vercel.com/dashboard")}
              >
                <ExternalLink className="size-3.5 mr-2" />
                Vercel Dashboard
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderConfigFields(
  raw: Record<string, unknown>,
  depth = 0,
): React.ReactNode {
  return Object.entries(raw)
    .filter(([, v]) => typeof v !== "object" || v === null)
    .slice(0, 10)
    .map(([key, value]) => (
      <div key={key} className="flex items-start gap-3 text-xs">
        <span
          className="text-muted-foreground font-mono shrink-0"
          style={{ paddingLeft: depth * 12 }}
        >
          {key}
        </span>
        <span className="font-mono text-foreground">{String(value)}</span>
      </div>
    ));
}
