import { useState } from "react";
import { Bot, CheckCircle, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AppSettings, Project } from "@/types";

interface OnboardingWizardProps {
  settings: AppSettings;
  onComplete: () => void;
}

export function OnboardingWizard({
  settings,
  onComplete,
}: OnboardingWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [scanPath, setScanPath] = useState(settings.scan_path ?? "~/cv");
  const [scannedProjects, setScannedProjects] = useState<Project[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  const handleScan = async () => {
    setIsScanning(true);
    try {
      const projects = await api.scanProjects(scanPath);
      setScannedProjects(projects);
      setSelectedPaths(new Set(projects.map((p) => p.path)));
    } catch {
      setScannedProjects([]);
      setSelectedPaths(new Set());
    } finally {
      setIsScanning(false);
    }
  };

  const handleImport = async () => {
    const inputs = scannedProjects
      .filter((p) => selectedPaths.has(p.path))
      .map((p) => ({
        name: p.name,
        path: p.path,
        tags: p.tags,
        color: p.color ?? undefined,
        identity_key: p.identity_key ?? undefined,
      }));
    const imported = await api.importScannedProjects(inputs);
    setImportedCount(imported.length);
    setStep(3);
  };

  const handleSkip = () => {
    setImportedCount(0);
    setStep(3);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-8 w-full max-w-sm shadow-2xl">
        {step === 1 && <WelcomeStep onNext={() => setStep(2)} />}
        {step === 2 && (
          <ScanStep
            scanPath={scanPath}
            onScanPathChange={setScanPath}
            scannedProjects={scannedProjects}
            selectedPaths={selectedPaths}
            onToggle={(path) =>
              setSelectedPaths((prev) => {
                const next = new Set(prev);
                next.has(path) ? next.delete(path) : next.add(path);
                return next;
              })
            }
            onSelectAll={() =>
              setSelectedPaths(new Set(scannedProjects.map((p) => p.path)))
            }
            onSelectNone={() => setSelectedPaths(new Set())}
            isScanning={isScanning}
            onScan={handleScan}
            onImport={handleImport}
            onSkip={handleSkip}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <DoneStep importedCount={importedCount} onComplete={onComplete} />
        )}
      </div>
    </div>
  );
}

// ─── Step 1: Welcome ────────────────────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center">
        <Bot className="size-9 text-primary-foreground" />
      </div>
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Claude Commander
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your macOS command center for Claude Code.
          <br />
          Let's get your workspace set up.
        </p>
      </div>
      <button
        type="button"
        onClick={onNext}
        className={cn(
          "mt-2 flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium",
          "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
        )}
      >
        Get Started
        <ArrowRight className="size-4" />
      </button>
    </div>
  );
}

// ─── Step 2: Scan ───────────────────────────────────────────────────────────

interface ScanStepProps {
  scanPath: string;
  onScanPathChange: (v: string) => void;
  scannedProjects: Project[];
  selectedPaths: Set<string>;
  onToggle: (path: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  isScanning: boolean;
  onScan: () => void;
  onImport: () => void;
  onSkip: () => void;
  onBack: () => void;
}

function ScanStep({
  scanPath,
  onScanPathChange,
  scannedProjects,
  selectedPaths,
  onToggle,
  onSelectAll,
  onSelectNone,
  isScanning,
  onScan,
  onImport,
  onSkip,
  onBack,
}: ScanStepProps) {
  const hasProjects = scannedProjects.length > 0;
  const selectedCount = selectedPaths.size;
  const allSelected = selectedCount === scannedProjects.length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Where are your projects?
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Enter a directory path to scan for Claude Code projects.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={scanPath}
          onChange={(e) => onScanPathChange(e.target.value)}
          placeholder="~/cv"
          className={cn(
            "flex-1 px-3 py-1.5 rounded-lg text-sm border border-border bg-background",
            "text-foreground placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-primary/50",
          )}
        />
        <button
          type="button"
          onClick={onScan}
          disabled={isScanning}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium",
            "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {isScanning ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Scan
        </button>
      </div>

      {/* Project list */}
      {hasProjects && (
        <div className="flex flex-col gap-1.5">
          {/* Select all / none */}
          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs text-muted-foreground">
              {selectedCount} of {scannedProjects.length} selected
            </span>
            <button
              type="button"
              onClick={allSelected ? onSelectNone : onSelectAll}
              className="text-xs text-primary hover:underline"
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          </div>

          <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-background divide-y divide-border">
            {scannedProjects.map((p) => {
              const checked = selectedPaths.has(p.path);
              return (
                <button
                  key={p.path}
                  type="button"
                  onClick={() => onToggle(p.path)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                    checked
                      ? "bg-background hover:bg-accent/40"
                      : "bg-muted/40 hover:bg-muted/60",
                  )}
                >
                  {/* Checkbox */}
                  <span
                    className={cn(
                      "size-4 rounded flex items-center justify-center shrink-0 border transition-colors",
                      checked
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-border bg-background",
                    )}
                  >
                    {checked && (
                      <svg viewBox="0 0 10 8" className="size-2.5 fill-current">
                        <path
                          d="M1 4l3 3 5-6"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-xs font-medium truncate",
                        !checked && "text-muted-foreground",
                      )}
                    >
                      {p.name}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {p.path.replace(/^\/Users\/[^/]+/, "~")}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between mt-1">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>

        {hasProjects ? (
          <button
            type="button"
            onClick={onImport}
            disabled={selectedCount === 0}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium",
              "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            Import {selectedCount} project
            {selectedCount !== 1 ? "s" : ""}
          </button>
        ) : (
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Step 3: Done ───────────────────────────────────────────────────────────

function DoneStep({
  importedCount,
  onComplete,
}: {
  importedCount: number;
  onComplete: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-4">
      <CheckCircle className="size-14 text-green-500" />
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          You're all set!
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {importedCount > 0
            ? `${importedCount} project${importedCount !== 1 ? "s" : ""} imported. You can always add more from Settings → Scan Projects.`
            : "You can always add projects from Settings → Scan Projects."}
        </p>
      </div>
      <button
        type="button"
        onClick={onComplete}
        className={cn(
          "mt-2 px-5 py-2 rounded-lg text-sm font-medium",
          "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
        )}
      >
        Open Dashboard
      </button>
    </div>
  );
}
