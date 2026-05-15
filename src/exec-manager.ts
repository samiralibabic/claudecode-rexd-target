import type { ExecBufferSnapshot, ExecExit } from "./types"

type StreamName = "stdout" | "stderr"

type ExecState = {
  processId: string
  stdout: string
  stderr: string
  stdoutTruncated: boolean
  stderrTruncated: boolean
  exit?: ExecExit
  updatedAt: number
}

type ExitWaiter = {
  resolve: (exit: ExecExit) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export function decodeEventData(data: unknown, encoding: unknown): string {
  const value = String(data ?? "")
  if (encoding === "base64") return Buffer.from(value, "base64").toString("utf8")
  return value
}

function appendCapped(current: string, chunk: string, maxBytes: number): { value: string; truncated: boolean } {
  if (maxBytes <= 0) return { value: current + chunk, truncated: false }
  const bytes = Buffer.from(current + chunk)
  if (bytes.length <= maxBytes) return { value: current + chunk, truncated: false }
  return { value: bytes.subarray(bytes.length - maxBytes).toString("utf8"), truncated: true }
}

export class ExecManager {
  private states = new Map<string, ExecState>()
  private waiters = new Map<string, ExitWaiter[]>()

  constructor(private readonly maxStreamBytes = 2 * 1024 * 1024) {}

  ensure(processId: string): ExecState {
    let state = this.states.get(processId)
    if (!state) {
      state = {
        processId,
        stdout: "",
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
        updatedAt: Date.now(),
      }
      this.states.set(processId, state)
    }
    return state
  }

  handleNotification(method: string, params: Record<string, unknown>): boolean {
    if (method === "exec.stdout" || method === "exec.stderr") {
      const processId = String(params.process_id ?? "")
      if (!processId) return true
      this.append(processId, method === "exec.stdout" ? "stdout" : "stderr", decodeEventData(params.data, params.encoding))
      return true
    }

    if (method === "exec.exit") {
      const processId = String(params.process_id ?? "")
      if (!processId) return true
      this.markExit(processId, {
        session_id: typeof params.session_id === "string" ? params.session_id : undefined,
        process_id: processId,
        exit_code: typeof params.exit_code === "number" ? params.exit_code : null,
        signal: typeof params.signal === "string" ? params.signal : null,
        timed_out: params.timed_out === true,
        duration_ms: typeof params.duration_ms === "number" ? params.duration_ms : undefined,
        bytes_stdout: typeof params.bytes_stdout === "number" ? params.bytes_stdout : undefined,
        bytes_stderr: typeof params.bytes_stderr === "number" ? params.bytes_stderr : undefined,
        status: "exited",
      })
      return true
    }

    return false
  }

  append(processId: string, stream: StreamName, data: string): void {
    const state = this.ensure(processId)
    const result = appendCapped(state[stream], data, this.maxStreamBytes)
    state[stream] = result.value
    if (stream === "stdout") state.stdoutTruncated = state.stdoutTruncated || result.truncated
    else state.stderrTruncated = state.stderrTruncated || result.truncated
    state.updatedAt = Date.now()
  }

  markExit(processId: string, exit: ExecExit): void {
    const state = this.ensure(processId)
    state.exit = exit
    state.updatedAt = Date.now()

    const waiters = this.waiters.get(processId) ?? []
    this.waiters.delete(processId)
    for (const waiter of waiters) {
      clearTimeout(waiter.timer)
      waiter.resolve(exit)
    }
  }

  waitForExit(processId: string, timeoutMs: number): Promise<ExecExit> {
    const existing = this.states.get(processId)?.exit
    if (existing) return Promise.resolve(existing)

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiters = this.waiters.get(processId) ?? []
        this.waiters.set(
          processId,
          waiters.filter((waiter) => waiter.timer !== timer),
        )
        reject(new Error(`Remote process ${processId} did not exit before timeout`))
      }, timeoutMs)

      const waiters = this.waiters.get(processId) ?? []
      waiters.push({ resolve, reject, timer })
      this.waiters.set(processId, waiters)
    })
  }

  snapshot(processId: string): ExecBufferSnapshot {
    const state = this.ensure(processId)
    return {
      processId,
      stdout: state.stdout,
      stderr: state.stderr,
      stdoutTruncated: state.stdoutTruncated,
      stderrTruncated: state.stderrTruncated,
      exit: state.exit,
      status: state.exit ? "exited" : "running",
    }
  }

  delete(processId: string): void {
    this.states.delete(processId)
    const waiters = this.waiters.get(processId) ?? []
    this.waiters.delete(processId)
    for (const waiter of waiters) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error(`Remote process ${processId} buffer was removed`))
    }
  }

  rejectAll(reason: string): void {
    for (const waiters of this.waiters.values()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timer)
        waiter.reject(new Error(reason))
      }
    }
    this.waiters.clear()
  }
}
