---
description: Manage the active REXD target for remote Claude Code work
disable-model-invocation: true
---

Use the `rexd-target` MCP tools to manage the active remote target.

User arguments: $ARGUMENTS

Supported commands:

- list
- use <alias>
- status
- clear

Rules:

- `list` calls `mcp__rexd-target__target_list`.
- `use <alias>` calls `mcp__rexd-target__target_use`.
- `status` calls `mcp__rexd-target__target_status`.
- `clear` calls `mcp__rexd-target__target_clear`.
- After a target is active, use only `rexd-target` MCP tools for filesystem, search, shell, and PTY work.
