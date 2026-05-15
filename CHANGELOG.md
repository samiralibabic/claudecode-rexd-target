# Changelog

## v0.1.0 - Unreleased

- Initial Claude Code plugin with `rexd-target` MCP server.
- Add target list/use/status/clear tools backed by `~/.config/rexd/targets.json`.
- Add SSH stdio JSON-RPC transport for `rexd --stdio`.
- Add remote filesystem, search, exec, and PTY tools.
- Add `PreToolUse` hook to block local built-ins while a target is active.
- Add installable project-local `/target` alias for shorter Claude Code UX.
