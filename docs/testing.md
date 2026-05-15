# Testing

## Local Verification

```bash
bun install
bun run typecheck
bun test
bun run build
```

## Claude Code Smoke Test

Normal install smoke test:

```bash
claude plugin marketplace add samiralibabic/claudecode-rexd-target
claude plugin install claudecode-rexd-target@rexd-ecosystem --scope user
claude
```

Development smoke test:

```bash
claude --plugin-dir /path/to/claudecode-rexd-target --debug
```

Inside Claude Code:

```text
/mcp
/claudecode-rexd-target:target list
/claudecode-rexd-target:target use <alias>
/claudecode-rexd-target:target status
```

Optional short command setup:

```text
/claudecode-rexd-target:install-target-alias .
```

Or from a local checkout:

```bash
bun run install:target-alias /path/to/your/project
```

Then use:

```text
/target list
/target use <alias>
/target status
/target clear
```

With a target active, local `Bash`, `Read`, `Write`, `Edit`, `MultiEdit`, `Glob`, and `Grep` should be denied by the hook.
