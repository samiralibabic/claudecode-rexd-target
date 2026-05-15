# Security Policy

## Security Model

`claudecode-rexd-target` lets Claude Code operate on remote machines through REXD over SSH stdio. Treat every configured target as a remote execution trust boundary.

- SSH handles authentication, host key verification, and transport security.
- The plugin does not store SSH keys, passwords, or tokens.
- The plugin state stores only the active target alias and project metadata needed to route tools and enforce local-tool blocking.
- The remote `rexd` process runs with the permissions of the configured SSH/REXD user.
- Remote filesystem RPCs are constrained by the target `workspaceRoots`, plugin root policy, and the remote `rexd` `security.allowed_roots` setting.
- Shell execution is a separate remote code execution capability. Filesystem RPC root guards do not sandbox arbitrary shell commands.
- Claude Code manual `!` shell escapes are local user actions, not Claude tool calls, and are not blocked by the plugin hook.

For restricted targets, use all of these controls:

- Set the plugin target `capabilities.shell` value to `false`.
- Set remote `security.allow_shell = false` in the REXD server config.
- Use a restricted SSH user with only the permissions needed for the target.
- Restrict remote `security.allowed_roots` to the minimum required paths.

## Supported Versions

Security fixes are applied to the latest release and the `main` branch.

## Reporting a Vulnerability

Please do not open public issues for security vulnerabilities.

Report privately to the maintainers with:

- A clear description of the issue
- Reproduction steps or proof of concept
- Impact assessment
- Suggested remediation if known

We aim to acknowledge reports within 3 business days and provide mitigation guidance after triage.
