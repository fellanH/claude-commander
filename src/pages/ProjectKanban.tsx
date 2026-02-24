import { useState } from "react";
import { useOutletContext } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { PlanningItem, PlanningStatus, Project } from "@/types";

interface OutletContext {
  project: Project;
}

const COLUMNS: {
  status: PlanningStatus;
  label: string;
  dotClass: string;
}[] = [
  { status: "backlog", label: "Backlog", dotClass: "bg-slate-400" },
  { status: "todo", label: "Todo", dotClass: "bg-blue-400" },
  { status: "in_progress", label: "In Progress", dotClass: "bg-amber-400" },
  { status: "done", label: "Done", dotClass: "bg-green-400" },
];

export default function ProjectKanban() {
  const { project } = useOutletContext<OutletContext>();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["planning-items", project.id],
    queryFn: () => api.getPlanningItems(project.id),
  });

  const moveMutation = useMutation({
    mutationFn: ({
      id,
      status,
      sort_order,
    }: {
      id: string;
      status: PlanningStatus;
      sort_order: number;
    }) => api.movePlanningItem(id, status, sort_order),
    onMutate: async ({ id, status, sort_order }) => {
      await queryClient.cancelQueries({
        queryKey: ["planning-items", project.id],
      });
      const prev = queryClient.getQueryData<PlanningItem[]>([
        "planning-items",
        project.id,
      ]);
      queryClient.setQueryData<PlanningItem[]>(
        ["planning-items", project.id],
        (old = []) =>
          old.map((item) =>
            item.id === id ? { ...item, status, sort_order } : item,
          ),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(["planning-items", project.id], ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["planning-items", project.id],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deletePlanningItem(id),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["planning-items", project.id],
      }),
  });

  const updateMutation = useMutation({
    mutationFn: (item: { id: string; subject: string; description?: string }) =>
      api.updatePlanningItem(item),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["planning-items", project.id],
      }),
  });

  const createMutation = useMutation({
    mutationFn: (input: {
      project_id: string;
      subject: string;
      status: PlanningStatus;
    }) => api.createPlanningItem(input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["planning-items", project.id],
      }),
  });

  function handleMoveItem(item: PlanningItem, direction: "prev" | "next") {
    const colIndex = COLUMNS.findIndex((c) => c.status === item.status);
    const newIndex = direction === "prev" ? colIndex - 1 : colIndex + 1;
    if (newIndex < 0 || newIndex >= COLUMNS.length) return;

    const destStatus = COLUMNS[newIndex].status;
    const destItems = items
      .filter((i) => i.status === destStatus)
      .sort((a, b) => a.sort_order - b.sort_order);

    // Place at the end of the destination column
    const newSortOrder =
      destItems.length > 0
        ? destItems[destItems.length - 1].sort_order + 1000
        : 1000;

    moveMutation.mutate({
      id: item.id,
      status: destStatus,
      sort_order: newSortOrder,
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-border shrink-0">
        <h2 className="text-base font-semibold">Kanban</h2>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="flex gap-4 min-w-max min-h-full">
          {COLUMNS.map((col, colIndex) => {
            const colItems = items
              .filter((i) => i.status === col.status)
              .sort((a, b) => a.sort_order - b.sort_order);
            return (
              <KanbanColumn
                key={col.status}
                status={col.status}
                label={col.label}
                dotClass={col.dotClass}
                items={colItems}
                isFirstColumn={colIndex === 0}
                isLastColumn={colIndex === COLUMNS.length - 1}
                onDelete={(id) => deleteMutation.mutate(id)}
                onUpdate={(id, subject, description) =>
                  updateMutation.mutate({ id, subject, description })
                }
                onAddItem={(subject) =>
                  createMutation.mutate({
                    project_id: project.id,
                    subject,
                    status: col.status,
                  })
                }
                onMoveItem={handleMoveItem}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Column ──────────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  status: PlanningStatus;
  label: string;
  dotClass: string;
  items: PlanningItem[];
  isFirstColumn: boolean;
  isLastColumn: boolean;
  onDelete: (id: string) => void;
  onUpdate: (id: string, subject: string, description?: string) => void;
  onAddItem: (subject: string) => void;
  onMoveItem: (item: PlanningItem, direction: "prev" | "next") => void;
}

function KanbanColumn({
  label,
  dotClass,
  items,
  isFirstColumn,
  isLastColumn,
  onDelete,
  onUpdate,
  onAddItem,
  onMoveItem,
}: KanbanColumnProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newSubject, setNewSubject] = useState("");

  function submitNew() {
    const text = newSubject.trim();
    if (text) {
      onAddItem(text);
    }
    setNewSubject("");
    setIsAdding(false);
  }

  return (
    <div className="flex flex-col w-72 shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-2 py-2 mb-2">
        <span className={cn("w-2 h-2 rounded-full shrink-0", dotClass)} />
        <span className="text-sm font-semibold flex-1">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {items.length}
        </span>
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title={`Add to ${label}`}
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 flex-1 rounded-lg p-2 min-h-24">
        {items.map((item) => (
          <KanbanCard
            key={item.id}
            item={item}
            isFirstColumn={isFirstColumn}
            isLastColumn={isLastColumn}
            onDelete={onDelete}
            onUpdate={onUpdate}
            onMoveItem={onMoveItem}
          />
        ))}

        {isAdding && (
          <div className="rounded-md border border-border bg-card p-2 shadow-sm">
            <input
              type="text"
              autoFocus
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder="Card title…"
              className="w-full text-sm bg-transparent outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNew();
                if (e.key === "Escape") {
                  setNewSubject("");
                  setIsAdding(false);
                }
              }}
              onBlur={submitNew}
            />
          </div>
        )}

        {items.length === 0 && !isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 px-2 py-2 rounded-md text-xs text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/50 transition-colors w-full"
          >
            <Plus className="size-3" />
            Add card
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

interface KanbanCardProps {
  item: PlanningItem;
  isFirstColumn: boolean;
  isLastColumn: boolean;
  onDelete: (id: string) => void;
  onUpdate: (id: string, subject: string, description?: string) => void;
  onMoveItem: (item: PlanningItem, direction: "prev" | "next") => void;
}

function KanbanCard({
  item,
  isFirstColumn,
  isLastColumn,
  onDelete,
  onUpdate,
  onMoveItem,
}: KanbanCardProps) {
  const [editingSubject, setEditingSubject] = useState(false);
  const [subjectVal, setSubjectVal] = useState(item.subject);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descVal, setDescVal] = useState(item.description ?? "");

  function saveSubject() {
    setEditingSubject(false);
    const val = subjectVal.trim();
    if (val && val !== item.subject) {
      onUpdate(item.id, val, item.description ?? undefined);
    } else {
      setSubjectVal(item.subject);
    }
  }

  function saveDesc() {
    setEditingDesc(false);
    if (descVal !== (item.description ?? "")) {
      onUpdate(item.id, item.subject, descVal || undefined);
    }
  }

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card shadow-sm p-3 group",
        (editingSubject || editingDesc) && "ring-2 ring-ring",
      )}
    >
      <div className="flex items-start gap-2">
        {/* Content */}
        <div className="flex-1 min-w-0">
          {editingSubject ? (
            <input
              type="text"
              autoFocus
              value={subjectVal}
              onChange={(e) => setSubjectVal(e.target.value)}
              className="w-full text-sm font-medium bg-transparent outline-none border-b border-ring pb-0.5"
              onBlur={saveSubject}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveSubject();
                if (e.key === "Escape") {
                  setSubjectVal(item.subject);
                  setEditingSubject(false);
                }
              }}
            />
          ) : (
            <p
              className="text-sm font-medium cursor-text"
              onClick={() => setEditingSubject(true)}
            >
              {item.subject}
            </p>
          )}

          {editingDesc ? (
            <textarea
              autoFocus
              value={descVal}
              onChange={(e) => setDescVal(e.target.value)}
              rows={3}
              className="w-full text-xs text-muted-foreground mt-1 bg-transparent outline-none resize-none border-b border-ring pb-0.5"
              onBlur={saveDesc}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDescVal(item.description ?? "");
                  setEditingDesc(false);
                }
              }}
            />
          ) : item.description ? (
            <p
              className="text-xs text-muted-foreground mt-1 line-clamp-2 cursor-text"
              onClick={() => setEditingDesc(true)}
            >
              {item.description}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setEditingDesc(true)}
              className="text-xs text-muted-foreground/40 mt-1 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            >
              + description
            </button>
          )}
        </div>

        {/* Delete */}
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
          title="Delete card"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* Move buttons */}
      <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onMoveItem(item, "prev")}
          disabled={isFirstColumn}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move to previous column"
        >
          <ChevronLeft className="size-3" />
          Back
        </button>
        <button
          type="button"
          onClick={() => onMoveItem(item, "next")}
          disabled={isLastColumn}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move to next column"
        >
          Forward
          <ChevronRight className="size-3" />
        </button>
      </div>
    </div>
  );
}
