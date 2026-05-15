import type { spawn } from "node:child_process"

export type RootPolicyMode = "strict" | "allow_within_server_roots" | "ask_on_escape"

export type RootPolicy = {
  mode?: RootPolicyMode
  extraRoots?: string[]
}

export type TargetConfig = {
  transport: "ssh" | "http" | "ws" | string
  description?: string
  loginShell?: boolean
  defaultCwd?: string
  workspaceRoots?: string[]
  rootPolicy?: RootPolicy
  capabilities?: Record<string, boolean | undefined> & {
    shell?: boolean
    fs?: boolean
    pty?: boolean
  }
  host?: string
  user?: string
  port?: number
  identityFile?: string
  command?: string
  sshOptions?: string[]
  homeDir?: string
}

export type TargetsFile = {
  version?: number
  targets: Record<string, TargetConfig>
}

export type RexdStateLocation = "repo-local" | "global-cache"

export type RexdState = {
  activeTargetAlias: string | null
  remoteCwdOverride?: string | null
  lastUsedAt: number
  projectKey: string
  stateLocation: RexdStateLocation
}

export type ResolvedStatePath = {
  projectRoot: string
  projectKey: string
  statePath: string
  stateLocation: RexdStateLocation
}

export type RexdRpcRequest = {
  jsonrpc: "2.0"
  id: number
  method: string
  params?: Record<string, unknown>
}

export type RexdRpcResponse = {
  jsonrpc: "2.0"
  id: number
  result?: unknown
  error?: {
    code?: number
    message?: string
    data?: unknown
  }
}

export type RexdRpcNotification = {
  jsonrpc?: "2.0"
  method: string
  params?: Record<string, unknown>
}

export type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
  method: string
}

export type ProcessLike = ReturnType<typeof spawn>

export type SessionOpenResult = {
  session_id?: string
  protocol?: string
  server_version?: string
  capabilities?: string[]
  limits?: Record<string, number>
  workspace_roots?: string[]
}

export type ExecExit = {
  session_id?: string
  process_id: string
  exit_code?: number | null
  signal?: string | null
  timed_out?: boolean
  duration_ms?: number
  bytes_stdout?: number
  bytes_stderr?: number
  status?: string
}

export type ExecBufferSnapshot = {
  processId: string
  stdout: string
  stderr: string
  stdoutTruncated: boolean
  stderrTruncated: boolean
  exit?: ExecExit
  status: "running" | "exited" | "unknown"
}

export type PtyState = {
  ptyId: string
  processId?: string
  buffer: string
  bytesBuffered: number
  truncated: boolean
  closed: boolean
  exitCode?: number | null
  signal?: string | null
  updatedAt: number
}

export type Connection = {
  key: string
  alias: string
  projectKey: string
  target: TargetConfig
  rpc: import("./rpc").RexdRpcClient
  remoteSessionID: string
  cwd: string
  workspaceRoots: string[]
  protocol?: string
  serverVersion?: string
  capabilities?: string[]
  limits?: Record<string, number>
  execManager: import("./exec-manager").ExecManager
  ptyManager: import("./pty-manager").PtyManager
  openedAt: number
  lastUsedAt: number
}
