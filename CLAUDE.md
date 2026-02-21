# Claude Commander — CLAUDE.md

## What this is

A native macOS command center for Claude Code users. Surfaces `~/.claude/tasks/`, `~/.claude/plans/`, session history, and adds per-project tooling: git status, terminal launching, env var management, and deploy config viewing.

**DB location:** `~/.claude-commander/commander.db` (survives reinstalls)

## Stack

| Layer    | Choice                                                                  |
| -------- | ----------------------------------------------------------------------- |
| Desktop  | Tauri 2                                                                 |
| Frontend | React 19, React Router v7, TypeScript                                   |
| Styling  | Tailwind CSS 4 (`@theme inline` pattern), shadcn/ui components (manual) |
| State    | TanStack Query + Zustand                                                |
| Backend  | Rust, rusqlite (bundled), git2, notify, walkdir, dotenvy, toml          |

## Dev

```bash
npm install
npm run tauri dev   # Starts Vite + Tauri
```

Frontend runs on port 1420. Tauri watches src-tauri/ for Rust changes.

## Build

```bash
npm run build                # Frontend only
npm run tauri build          # Full app bundle
```

## Architecture

```
src/
  App.tsx              # Route tree
  main.tsx             # QueryClient + Router setup
  components/
    RootLayout.tsx     # 56px icon-only primary nav
    SecondaryNav.tsx   # 220px contextual secondary nav
    ui/                # shadcn-style components (manual, no CLI)
  pages/               # One file per route
  lib/
    api.ts             # All invoke() calls to Rust backend
    store.ts           # Zustand (theme, selectedProject)
    utils.ts           # cn(), formatRelativeTime(), etc.
  types/index.ts       # Shared TS interfaces mirroring Rust models

src-tauri/src/
  main.rs              # Plugin registration, AppState init, DB init, watcher
  db.rs                # SQLite schema init (WAL mode)
  error.rs             # CommanderError enum (serde-tagged)
  state.rs             # AppState (Mutex<Option<Connection>>, claude_watcher)
  models.rs            # Rust structs matching TS types
  commands/
    projects.rs        # scan_projects, get_projects, upsert_project
    claude.rs          # read_claude_tasks, list_claude_plans, read_claude_sessions
    git.rs             # git_status, git_log, git_branches (git2 crate)
    terminal.rs        # detect_terminal, launch_claude (osascript)
    env.rs             # list_env_files, get_env_vars, set_env_var, delete_env_var
    settings.rs        # get_settings, update_settings
  services/
    file_watcher.rs    # notify crate watcher for ~/.claude/
```

## Key Patterns

### Tailwind v4 theming

Use `@theme inline` to map CSS custom properties to Tailwind utilities:

```css
@theme inline {
  --color-border: var(--border);
  /* etc. */
}
:root {
  --border: oklch(...);
}
.dark {
  --border: oklch(...);
}
```

### Tauri commands

All commands return `CmdResult<T>` = `Result<T, String>` where errors are JSON-serialized `CommanderError`.

### File watching

The `ClaudeWatcher` (notify crate) watches `~/.claude/` and emits Tauri events:

- `claude-tasks-changed`
- `claude-plans-changed`
- `claude-sessions-changed`

Frontend subscribes with `listen()` from `@tauri-apps/api/event`.

## Navigation Structure

```
/ icon nav /        / 220px secondary /    / main content /
Dashboard           (none)                  Project grid
Projects       →    [project list]          ProjectsList
  /:id             Overview/Tasks/Plans/   Per-project
                   Terminal/Git/Env/Deploy
Claude         →    Tasks/Plans/Sessions   Global Claude data
Settings            (none)                  Settings form
```

## Phase 2 Roadmap

- Planning kanban (`planning_items` table already created)
- In-app terminal via tauri-plugin-pty + xterm.js
- Session history viewer (browse JSONL content)
- Fly.io API integration
- Global search
- Auto-update via tauri-plugin-updater
