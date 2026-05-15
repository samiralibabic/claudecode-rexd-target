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

```bash
rexd-target-install-alias /path/to/your/project
```

From a local checkout, `bun run install:target-alias /path/to/your/project` is also available.

Then use:

```text
/target list
/target use <alias>
/target status
/target clear
```

With a target active, local `Bash`, `Read`, `Write`, `Edit`, `MultiEdit`, `Glob`, and `Grep` should be denied by the hook.
