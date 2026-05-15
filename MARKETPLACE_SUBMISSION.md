# Claude Code Marketplace Submission: claudecode-rexd-target

## Summary

`claudecode-rexd-target` lets Claude Code operate on configured remote machines through REXD over SSH stdio. It provides target switching, remote filesystem tools, remote command execution, and PTY support through a bundled MCP server.

## Why It Belongs In The Marketplace

Claude Code users often need to inspect and operate remote servers without copying files locally or manually wrapping SSH commands. This plugin provides a reusable target-switching layer with explicit remote-only enforcement while a target is active.

## Key Features

- Shared REXD target registry at `~/.config/rexd/targets.json`
- `/claudecode-rexd-target:target list|use|status|clear`
- Optional global `/target` alias
- Remote file tools: read, write, list, glob, grep, stat, edit, patch
- Remote shell tools: exec, long-running exec, stdin, kill
- Remote PTY tools with buffered output
- `PreToolUse` hook blocks local `Bash`, `Read`, `Write`, `Edit`, `MultiEdit`, `Glob`, and `Grep` while a target is active
- Installed runtime uses Node and committed bundled output at `dist/server.js`

## Security Model

- SSH handles authentication and transport security.
- REXD enforces filesystem roots for filesystem RPCs.
- Shell execution is a separate capability and has the permissions of the configured SSH/REXD user.
- Filesystem RPC roots do not sandbox arbitrary shell commands.
- For restricted targets, disable shell in both the plugin target capabilities and remote REXD server config.
- The plugin does not store SSH keys, passwords, or tokens.

## Requirements

- Claude Code with plugin support
- Node.js at runtime
- REXD v0.1.5+ installed on remote targets
- SSH access to configured targets

## Current Distribution

Self-hosted Claude Code marketplace:

```bash
claude plugin marketplace add samiralibabic/claudecode-rexd-target
claude plugin install claudecode-rexd-target@rexd-ecosystem --scope user
```

## Official Marketplace Path

Checked on 2026-05-15 with Claude Code `2.1.142`.

- `claude plugin --help` lists install, update, validate, tag, and marketplace management commands.
- `claude plugin marketplace --help` lists add, list, remove, and update commands.
- `claude plugin validate --help` validates plugin or marketplace manifests.
- `claude plugin publish --help` and `claude plugin submit --help` do not expose publish or submit subcommands in the current CLI.
- Current Claude Code plugin documentation at `https://docs.anthropic.com/en/docs/claude-code/plugins` says official Anthropic marketplace submission uses the in-app forms at `https://claude.ai/settings/plugins/submit` or `https://platform.claude.com/plugins/submit`.
- Submission action: use one of those forms with the repository URL, self-hosted marketplace install instructions, validation output, and this security model summary.

## Validation

Expected checks before submission:

```bash
claude plugin validate .
bun run typecheck
bun test
bun run build
node --check dist/server.js
```

Local plugin inventory check:

```bash
claude --plugin-dir . plugin details claudecode-rexd-target
```

The known-working MCP layout uses root `.mcp.json`; this command should report `MCP servers (1)` with `rexd-target`.
