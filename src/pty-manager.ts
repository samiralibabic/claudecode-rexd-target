import { decodeEventData } from "./exec-manager"
import type { PtyState } from "./types"

function appendCapped(current: string, chunk: string, maxBytes: number): { value: string; bytes: number; truncated: boolean } {
  if (maxBytes <= 0) {
    const next = current + chunk
    return { value: next, bytes: Buffer.byteLength(next), truncated: false }
  }
  const bytes = Buffer.from(current + chunk)
  if (bytes.length <= maxBytes) return { value: current + chunk, bytes: bytes.length, truncated: false }
  const next = bytes.subarray(bytes.length - maxBytes).toString("utf8")
  return { value: next, bytes: Buffer.byteLength(next), truncated: true }
}

export class PtyManager {
  private ptys = new Map<string, PtyState>()

  constructor(private readonly maxBufferBytes = 2 * 1024 * 1024) {}

  markOpen(ptyId: string, processId?: string): PtyState {
    const state: PtyState = {
      ptyId,
      processId,
      buffer: "",
      bytesBuffered: 0,
      truncated: false,
      closed: false,
      updatedAt: Date.now(),
    }
    this.ptys.set(ptyId, state)
    return state
  }

  has(ptyId: string): boolean {
    return this.ptys.has(ptyId)
  }

  requireKnown(ptyId: string): PtyState {
    const state = this.ptys.get(ptyId)
    if (!state) throw new Error(`Unknown PTY id: ${ptyId}`)
    return state
  }

  private ensureFromEvent(ptyId: string): PtyState {
    let state = this.ptys.get(ptyId)
    if (!state) state = this.markOpen(ptyId)
    return state
  }

  handleNotification(method: string, params: Record<string, unknown>): boolean {
    if (method === "pty.output") {
      const ptyId = String(params.pty_id ?? "")
      if (!ptyId) return true
      const processId = typeof params.process_id === "string" ? params.process_id : undefined
      const state = this.ensureFromEvent(ptyId)
      if (processId) state.processId = processId
      this.append(ptyId, decodeEventData(params.data, params.encoding))
      return true
    }

    if (method === "pty.exit") {
      const ptyId = String(params.pty_id ?? "")
      if (!ptyId) return true
      const state = this.ensureFromEvent(ptyId)
      state.closed = true
      state.exitCode = typeof params.exit_code === "number" ? params.exit_code : null
      state.signal = typeof params.signal === "string" ? params.signal : null
      state.updatedAt = Date.now()
      return true
    }

    return false
  }

  append(ptyId: string, data: string): void {
    const state = this.ensureFromEvent(ptyId)
    const result = appendCapped(state.buffer, data, this.maxBufferBytes)
    state.buffer = result.value
    state.bytesBuffered = result.bytes
    state.truncated = state.truncated || result.truncated
    state.updatedAt = Date.now()
  }

  read(ptyId: string, maxBytes = 65536, drain = true): { output: string; state: PtyState } {
    const state = this.requireKnown(ptyId)
    let output = state.buffer
    let remaining = ""

    if (maxBytes > 0) {
      const bytes = Buffer.from(state.buffer)
      output = bytes.subarray(0, maxBytes).toString("utf8")
      remaining = bytes.subarray(maxBytes).toString("utf8")
    }

    if (drain) {
      state.buffer = remaining
      state.bytesBuffered = Buffer.byteLength(remaining)
      state.updatedAt = Date.now()
    }

    return { output, state: { ...state } }
  }

  list(): PtyState[] {
    return [...this.ptys.values()].map((state) => ({ ...state }))
  }

  close(ptyId: string): void {
    const state = this.requireKnown(ptyId)
    state.closed = true
    state.updatedAt = Date.now()
  }
}
