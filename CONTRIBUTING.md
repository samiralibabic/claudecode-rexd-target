# Contributing

Thanks for contributing to `claudecode-rexd-target`.

## Getting Started

1. Fork and clone the repository.
2. Install Bun.
3. Run:

```bash
bun install
make typecheck
make test
make build
```

## Pull Request Checklist

- Keep changes focused and small.
- Update docs when behavior changes.
- Ensure `bun run typecheck` succeeds.
- Ensure `bun test` succeeds.
- Ensure `bun run build` succeeds.
- Include repro steps for bug fixes.

## Commit Style

- Use concise, imperative commit messages.
- Explain the why in PR descriptions.

## Reporting Issues

Please include:

- Claude Code version
- Plugin version
- REXD version
- Target config with secrets redacted
- Repro steps and expected behavior
