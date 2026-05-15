# claudecode-rexd-target

Claude Code plugin for using configured REXD targets over SSH stdio.

The plugin provides:

- A bundled MCP server named `rexd-target`
- Remote filesystem, search, shell, and PTY tools backed by `rexd --stdio`
- A namespaced Claude Code command for target switching
- A `PreToolUse` hook that blocks local filesystem/search/shell built-ins while a target is active

## Requirements

- Claude Code with plugin support
- Bun
- SSH access to the remote target
- `rexd` installed on the remote host
- Remote `rexd` configured with `security.allowed_roots`

Recommended backend: `rexd` v0.1.4+ with `fs.edit`, `fs.patch`, and PTY support.

## Install

```bash
bun install
```

Run Claude Code with this plugin directory:

```bash
claude --plugin-dir ./rexd-ecosystem/claudecode-rexd-target --debug
```

If your shell is already inside `rexd-ecosystem/`, use `claude --plugin-dir ./claudecode-rexd-target --debug`.

The plugin MCP server is configured in `.mcp.json` and starts with:

```bash
bun run ${CLAUDE_PLUGIN_ROOT}/src/server.ts
```

Claude Code namespaces plugin commands, so the bundled command is `/claudecode-rexd-target:target`. For better day-to-day UX, install the project-local `/target` alias in the project where you run Claude Code:

```bash
cd /path/to/claudecode-rexd-target
bun run install:target-alias /path/to/your/project
```

The installer writes `/path/to/your/project/.claude/commands/target.md`.

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

Recommended short command after installing the alias:

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
