# claude-commander — Workspace Agent Instructions

You are working in the claude-commander workspace. Native macOS command center for Claude Code users — tasks, plans, sessions, git, env vars, and deploy config.

## Context Loading

At session start, load context from the vault:
- get_context(tags: ["claude-commander"]) <- workspace context
- get_context(query: "active goals priorities") <- cross-project context

## Status

Active product with 5 open GitHub issues.
