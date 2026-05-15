# claudecode-rexd-target

Claude Code plugin for using configured [REXD](https://github.com/samiralibabic/rexd) targets over SSH stdio.

The plugin provides:

- A bundled MCP server named `rexd-target`
- Remote filesystem, search, shell, and PTY tools backed by `rexd --stdio`
- A namespaced Claude Code command for target switching
- A `PreToolUse` hook that blocks local filesystem/search/shell built-ins while a target is active

## Requirements

- Claude Code with plugin support
- Bun available in `PATH` for the bundled MCP server
- SSH access to the remote target
- `rexd` installed on the remote host
- Remote `rexd` configured with `security.allowed_roots`

Recommended backend: `rexd` v0.1.4+ with `fs.edit`, `fs.patch`, and PTY support.

## Install

Install the plugin normally through Claude Code's plugin marketplace system:

```bash
claude plugin marketplace add samiralibabic/claudecode-rexd-target
claude plugin install claudecode-rexd-target@rexd-ecosystem --scope user
```

After that, start Claude Code normally from any project:

```bash
claude
```

Inside Claude Code, verify the plugin MCP server is connected:

```text
/mcp
```

The plugin MCP server is configured in `.mcp.json` and starts the bundled server with:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/dist/server.js
```

### Development Install

For local development without installing the marketplace:

```bash
bun install
claude --plugin-dir /path/to/claudecode-rexd-target --debug
```

Run this command from the project you want Claude to work in, not from inside this plugin repo. If you run Claude from inside this plugin repo, Claude may read this repo's `.mcp.json` as project MCP config and warn that plugin-only variables are missing.

### Optional /target Alias

Claude Code namespaces plugin commands, so the bundled target command is `/claudecode-rexd-target:target`.

For better day-to-day UX, install a project-local `/target` alias in the project where you run Claude Code:

```bash
rexd-target-install-alias /path/to/your/project
```

If you have a local checkout of this repo, you can also run `bun run install:target-alias /path/to/your/project` from the plugin checkout.

Both methods write:

```text
<project>/.claude/commands/target.md
```

Restart Claude Code if `/target` is not visible immediately.

### Updates

Update the marketplace and installed plugin with:

```bash
claude plugin marketplace update rexd-ecosystem
claude plugin update claudecode-rexd-target@rexd-ecosystem
```

## Target Registry

Targets are read from:

```text
~/.config/rexd/targets.json
```

Example:

```json
{
  "version": 1,
  "targets": {
    "prod": {
      "transport": "ssh",
      "host": "example.com",
      "user": "deploy",
      "port": 22,
      "identityFile": "~/.ssh/id_ed25519",
      "sshOptions": ["-o", "StrictHostKeyChecking=yes"],
      "command": "/usr/local/bin/rexd --stdio",
      "workspaceRoots": ["/srv/app"],
      "defaultCwd": "/srv/app",
      "loginShell": false,
      "capabilities": {
        "shell": true,
        "fs": true,
        "pty": true
      },
      "rootPolicy": {
        "mode": "strict",
        "extraRoots": []
      }
    }
  }
}
```

Only `transport: "ssh"` is supported in v0.1.

## Usage

Recommended short command after installing the optional alias:

```text
/target list
/target use prod
/target status
/target clear
```

The built-in plugin command remains available under Claude Code's required namespace:

```text
/claudecode-rexd-target:target list
/claudecode-rexd-target:target use prod
/claudecode-rexd-target:target status
/claudecode-rexd-target:target clear
```

After `target_use` succeeds, Claude should use only the `rexd-target` MCP tools for remote filesystem, search, shell, and PTY work.

Available MCP tools:

- Target: `target_list`, `target_use`, `target_status`, `target_clear`
- Filesystem: `read_file`, `write_file`, `list_dir`, `glob`, `grep`, `stat`, `edit_file`, `apply_patch`
- Exec: `exec`, `exec_start`, `exec_wait`, `exec_input`, `exec_kill`
- PTY: `pty_open`, `pty_input`, `pty_read`, `pty_resize`, `pty_close`, `pty_list`

## Remote-Only Enforcement

When a target is active, the hook in `hooks/hooks.json` denies local Claude Code built-ins:

```text
Bash, Read, Write, Edit, MultiEdit, Glob, Grep
```

Example denial:

```text
Local Read blocked because REXD target "prod" is active. Use mcp__rexd-target__read_file instead.
```

Run `target_clear` to disable the target and allow local built-ins again.

## State

State is project-specific.

If the Claude project has a `.claude/` directory, state is stored at:

```text
<projectRoot>/.claude/rexd-state.json
```

Otherwise, state is stored in a global cache keyed by the real project path:

```text
~/.cache/claudecode-rexd-target/state/<sha256(realpath(projectRootOrCwd))>.json
```

`target_status` reports the state path for debugging.

## Security

Security is layered:

- SSH handles authentication, host keys, and encryption.
- `rexd` enforces remote allowed roots and execution limits.
- The MCP adapter pre-checks remote paths against configured roots in strict mode.
- The Claude Code hook blocks accidental local operations while a remote target is active.

The plugin does not store SSH keys, passwords, or tokens.

## Development

```bash
bun install
bun run typecheck
bun test
bun run build
```

## Troubleshooting

If `/mcp` does not show `rexd-target`, run Claude Code with `--debug` and confirm Bun is available.

If `target_use` fails, check SSH access and that the remote command works manually:

```bash
ssh deploy@example.com /usr/local/bin/rexd --stdio
```

If remote file operations fail with a path error, check both the target `workspaceRoots` and the remote `rexd` `security.allowed_roots`.

If local tools are blocked unexpectedly, run:

```text
/claudecode-rexd-target:target status
/claudecode-rexd-target:target clear
```
