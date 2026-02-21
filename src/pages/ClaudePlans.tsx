import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { FileText, Clock, Loader2, ChevronLeft } from "lucide-react";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useClaudeWatcher } from "@/hooks/useClaudeWatcher";

export default function ClaudePlans() {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const {
    data: plans,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["claude-plans"],
    queryFn: api.listClaudePlans,
    staleTime: 30_000,
  });

  useClaudeWatcher("claude-plans-changed", refetch);

  const { data: planContent, isLoading: contentLoading } = useQuery({
    queryKey: ["claude-plan-content", selectedPlan],
    queryFn: () => api.readClaudePlan(selectedPlan!),
    enabled: !!selectedPlan,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-64">
        <FileText className="size-10 text-muted-foreground mb-3" />
        <h3 className="font-medium mb-1">No plans</h3>
        <p className="text-sm text-muted-foreground">
          Plans saved in ~/.claude/plans/ appear here
        </p>
      </div>
    );
  }

  // Plan reader view
  if (selectedPlan) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedPlan(null)}
          >
            <ChevronLeft className="size-4 mr-1" />
            Plans
          </Button>
          <span className="text-sm text-muted-foreground">/</span>
          <span className="text-sm font-medium">{selectedPlan}</span>
        </div>
        <ScrollArea className="flex-1 p-6">
          {contentLoading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <article className="prose prose-sm dark:prose-invert max-w-3xl">
              <ReactMarkdown>{planContent ?? ""}</ReactMarkdown>
            </article>
          )}
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-6">Plans</h1>

      <div className="space-y-2">
        {plans.map((plan) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => setSelectedPlan(plan.filename)}
            className="w-full text-left p-4 rounded-lg border border-border bg-card hover:bg-accent/20 transition-colors group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <FileText className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-medium text-sm group-hover:text-primary transition-colors">
                    {plan.title}
                  </p>
                  {plan.preview && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {plan.preview}
                    </p>
                  )}
                </div>
              </div>
              {plan.modified_at && (
                <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatRelativeTime(plan.modified_at)}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
