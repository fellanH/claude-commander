import { Outlet, useLocation, NavLink } from "react-router";
import {
  LayoutDashboard,
  FolderOpen,
  Bot,
  Settings,
  Moon,
  Sun,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { api } from "@/lib/api";
import { SecondaryNav } from "./SecondaryNav";
import { CommandPalette } from "./CommandPalette";
import { OnboardingWizard } from "./OnboardingWizard";
import { Toaster } from "sonner";

const primaryNavItems = [
  { path: "/", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/projects", icon: FolderOpen, label: "Projects" },
  { path: "/claude", icon: Bot, label: "Claude" },
  { path: "/settings", icon: Settings, label: "Settings" },
];

export function RootLayout() {
  const location = useLocation();
  const { theme, setTheme } = useAppStore();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const handleOnboardingComplete = async () => {
    if (!settings) return;
    await api.updateSettings({ ...settings, onboarding_completed: true });
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  const showWizard = settings !== undefined && !settings.onboarding_completed;

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Primary Nav — 56px icon-only */}
      <nav className="w-14 border-r border-border bg-card flex flex-col items-center py-3 gap-1 shrink-0">
        {/* Logo */}
        <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center mb-2">
          <Bot className="size-5 text-primary-foreground" />
        </div>

        <div className="flex-1 flex flex-col items-center gap-1 mt-2">
          {primaryNavItems.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              title={label}
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
                isActive(path)
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
            >
              <Icon className="size-5" />
            </NavLink>
          ))}
        </div>

        {/* Theme toggle */}
        <button
          type="button"
          title="Toggle theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          {theme === "dark" ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
        </button>
      </nav>

      {/* Secondary Nav — 220px contextual */}
      <SecondaryNav />

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-background">
        <Outlet />
      </main>

      <Toaster position="bottom-right" richColors />
      <CommandPalette />
      {showWizard && (
        <OnboardingWizard
          settings={settings}
          onComplete={handleOnboardingComplete}
        />
      )}
    </div>
  );
}
