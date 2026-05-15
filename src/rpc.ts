import { spawn } from "node:child_process"
import type { Readable, Writable } from "node:stream"
import { expandHome } from "./config"
import type { PendingRequest, RexdRpcNotification, RexdRpcResponse, TargetConfig } from "./types"

export class RexdRpcError extends Error {
  override name = "RexdRpcError"

  constructor(
    message: string,
    readonly code?: number,
    readonly data?: unknown,
  ) {
    super(message)
  }
}

export interface RpcProcess {
  stdin: Writable | null
  stdout: Readable | null
  stderr: Readable | null
  exitCode: number | null
  killed?: boolean
  kill: (signal?: NodeJS.Signals | number) => boolean
  on(event: "error", listener: (err: Error) => void): unknown
  on(event: "exit", listener: (code: number | null, signal: string | null) => void): unknown
}

export type NotificationHandler = (method: string, params: Record<string, unknown>) => void

const DEFAULT_REQUEST_TIMEOUT_MS = 30000
const STDERR_TAIL_BYTES = 16 * 1024

function appendTail(current: string, chunk: string, maxBytes: number): string {
  const next = current + chunk
  const bytes = Buffer.from(next)
  if (bytes.length <= maxBytes) return next
  return bytes.subarray(bytes.length - maxBytes).toString("utf8")
}

function formatCloseReason(prefix: string, stderrTail: string): string {
  const tail = stderrTail.trim()
  return tail ? `${prefix}. ssh stderr: ${tail}` : prefix
}

export function buildSshArgs(target: TargetConfig): string[] {
  const args: string[] = []
  if (target.port) args.push("-p", String(target.port))
  if (target.identityFile) args.push("-i", expandHome(target.identityFile))
  if (target.sshOptions?.length) args.push(...target.sshOptions)
  args.push("-T")
  args.push(target.user ? `${target.user}@${target.host}` : String(target.host))
  args.push(target.command ?? "/usr/local/bin/rexd --stdio")
  return args
}

export class RexdRpcClient {
  private buffer = ""
  private requestID = 0
  private pending = new Map<number, PendingRequest>()
  private closed = false
  private stderrTail = ""

  constructor(
    readonly alias: string,
    readonly proc: RpcProcess,
    private readonly onNotification?: NotificationHandler,
  ) {
    proc.stdout?.setEncoding("utf8")
    proc.stdout?.on("data", (chunk: string | Buffer) => this.handleStdout(String(chunk)))

    proc.stderr?.setEncoding("utf8")
    proc.stderr?.on("data", (chunk: string | Buffer) => {
      this.stderrTail = appendTail(this.stderrTail, String(chunk), STDERR_TAIL_BYTES)
    })

    proc.on("error", (err) => {
      this.close(formatCloseReason(`SSH error: ${err.message}`, this.stderrTail), false)
    })

    proc.on("exit", (code, signal) => {
      const suffix = signal ? ` (${signal})` : ""
      this.close(formatCloseReason(`SSH exited with code ${String(code)}${suffix}`, this.stderrTail), false)
    })
  }

  get isClosed(): boolean {
    return this.closed
  }

  get stderr(): string {
    return this.stderrTail
  }

  isAlive(): boolean {
    return !this.closed && this.proc.exitCode === null && this.proc.killed !== true
  }

  close(reason = "Connection closed", kill = true): void {
    if (this.closed) return
    this.closed = true

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error(reason))
    }
    this.pending.clear()

    try {
      this.proc.stdin?.end()
    } catch {}

    if (kill) {
      try {
        this.proc.kill("SIGTERM")
      } catch {}
    }
  }

  async request<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    if (!this.isAlive()) {
      throw new Error(`Connection to target "${this.alias}" is not active`)
    }
    if (!this.proc.stdin) {
      throw new Error("Connection stdin is not available")
    }

    const id = ++this.requestID
    const payload = `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`

    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Request "${method}" timed out`))
      }, timeoutMs)

      this.pending.set(id, {
        method,
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      })

      this.proc.stdin!.write(payload, (err?: Error | null) => {
        if (err) {
          clearTimeout(timer)
          this.pending.delete(id)
          reject(err)
        }
      })
    })
  }

  private handleStdout(chunk: string): void {
    this.buffer += chunk
    let newline = this.buffer.indexOf("\n")
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline)
      this.buffer = this.buffer.slice(newline + 1)
      if (line.trim()) this.handleLine(line)
      newline = this.buffer.indexOf("\n")
    }
  }

  private handleLine(line: string): void {
    let message: RexdRpcResponse | RexdRpcNotification
    try {
      message = JSON.parse(line)
    } catch {
      return
    }

    if ("id" in message && typeof message.id !== "undefined") {
      const pending = this.pending.get(Number(message.id))
      if (!pending) return
      this.pending.delete(Number(message.id))
      clearTimeout(pending.timer)

      if (message.error) {
        pending.reject(
          new RexdRpcError(
            String(message.error.message ?? `RPC method ${pending.method} failed`),
            message.error.code,
            message.error.data,
          ),
        )
      } else {
        pending.resolve(message.result)
      }
      return
    }

    if ("method" in message && typeof message.method === "string") {
      this.onNotification?.(message.method, (message.params ?? {}) as Record<string, unknown>)
    }
  }
}

export function createSshRexdRpcClient(
  alias: string,
  target: TargetConfig,
  onNotification?: NotificationHandler,
): RexdRpcClient {
  const proc = spawn("ssh", buildSshArgs(target), { stdio: ["pipe", "pipe", "pipe"] })
  return new RexdRpcClient(alias, proc, onNotification)
}
