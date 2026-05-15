---
description: Install the bare /target command alias into the current Claude project
---

Install the project-local `/target` alias for easier REXD target management.

User arguments: $ARGUMENTS

Rules:

- Use local Bash to run `rexd-target-install-alias "$ARGUMENTS"`.
- If `$ARGUMENTS` is empty, run `rexd-target-install-alias .`.
- Do this before activating a REXD target, because local Bash is blocked while a target is active.
- After installation, tell the user to restart Claude Code if `/target` is not visible immediately.
