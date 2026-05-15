import type { Connection, ExecBufferSnapshot, ExecExit } from "./types"

export type StartCommandInput = {
  command: string
  cwd: string
  timeoutMs?: number
  maxOutputBytes?: number
  login?: boolean
  detach?: boolean
}

export type RemoteCommandResult = ExecBufferSnapshot & {
  exitCode: number | null
  signal: string | null
  timedOut: boolean
  durationMs?: number
}

export async function startRemoteCommand(connection: Connection, input: StartCommandInput): Promise<string> {
  const result = await connection.rpc.request<{ process_id?: string; started_at?: string }>(
    "exec.start",
    {
      session_id: connection.remoteSessionID,
      command: input.command,
      shell: true,
      cwd: input.cwd,
      timeout_ms: input.timeoutMs,
      max_output_bytes: input.maxOutputBytes,
      login: input.login === true,
      detach: input.detach === true,
    },
    20000,
  )

  const processId = String(result.process_id ?? "")
  if (!processId) throw new Error("exec.start failed: missing process_id")
  connection.execManager.ensure(processId)
  connection.lastUsedAt = Date.now()
  return processId
}

function exitFromWaitResult(processId: string, wait: Record<string, unknown>): ExecExit | null {
  if (wait.status === "running") return null
  return {
    process_id: processId,
    status: typeof wait.status === "string" ? wait.status : "exited",
    exit_code: typeof wait.exit_code === "number" ? wait.exit_code : null,
    signal: typeof wait.signal === "string" ? wait.signal : null,
    bytes_stdout: typeof wait.bytes_stdout === "number" ? wait.bytes_stdout : undefined,
    bytes_stderr: typeof wait.bytes_stderr === "number" ? wait.bytes_stderr : undefined,
  }
}

export async function waitRemoteCommand(
  connection: Connection,
  processId: string,
  timeoutMs = 120000,
): Promise<ExecBufferSnapshot> {
  if (!connection.execManager.snapshot(processId).exit && timeoutMs > 0) {
    try {
      await connection.execManager.waitForExit(processId, timeoutMs)
    } catch {
      try {
        const wait = await connection.rpc.request<Record<string, unknown>>(
          "exec.wait",
          {
            session_id: connection.remoteSessionID,
            process_id: processId,
            timeout_ms: 1,
          },
          2000,
        )
        const exit = exitFromWaitResult(processId, wait)
        if (exit) connection.execManager.markExit(processId, exit)
      } catch {
        // exec.exit events are the primary mechanism; exec.wait is best-effort fallback.
      }
    }
  }

  return connection.execManager.snapshot(processId)
}

export async function runRemoteCommand(
  connection: Connection,
  input: StartCommandInput,
): Promise<RemoteCommandResult> {
  const timeoutMs = input.timeoutMs ?? 120000
  const startedAt = Date.now()
  const processId = await startRemoteCommand(connection, input)
  const snapshot = await waitRemoteCommand(connection, processId, timeoutMs + 5000)
  const exit = snapshot.exit
  connection.execManager.delete(processId)
  return {
    ...snapshot,
    exitCode: typeof exit?.exit_code === "number" ? exit.exit_code : null,
    signal: exit?.signal ?? null,
    timedOut: exit?.timed_out === true,
    durationMs: exit?.duration_ms ?? Date.now() - startedAt,
  }
}
