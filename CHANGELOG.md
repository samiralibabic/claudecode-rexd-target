# Changelog

## v0.1.3 - 2026-05-15

- Add coverage confirming `/` workspace roots allow absolute descendants in the Claude Code adapter guard.
- Update documentation and backend recommendation for `rexd v0.1.5`.
- Document that remote shell execution is not constrained by filesystem RPC root guards.

## v0.1.2 - 2026-05-15

- Add user-scope `/target` alias installation via `rexd-target-install-alias --user`.
- Document that `.mcp.json` is packaged plugin config and that `~/.config/rexd/targets.json` is the shared REXD target registry.

## v0.1.1 - 2026-05-15

- Switch installed plugin runtime from Bun source execution to bundled `dist/server.js` via Node.
- Switch the local-tool guard hook to Node so it does not depend on executable mode or Bun at runtime.
- Remove the alias-installer slash command to reduce command list noise.
- Keep `.claude/` local settings ignored and out of the repository.

## v0.1.0 - 2026-05-15

- Initial Claude Code plugin with `rexd-target` MCP server.
- Add target list/use/status/clear tools backed by `~/.config/rexd/targets.json`.
- Add SSH stdio JSON-RPC transport for `rexd --stdio`.
- Add remote filesystem, search, exec, and PTY tools.
- Add `PreToolUse` hook to block local built-ins while a target is active.
- Add installable project-local `/target` alias for shorter Claude Code UX.
- Add marketplace metadata for normal Claude Code plugin installation.
- Run the MCP server from the bundled `dist/server.js` for installable plugin cache compatibility.
