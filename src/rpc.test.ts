import { describe, expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import { RexdRpcClient, type RpcProcess } from "./rpc"

class FakeProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  exitCode: number | null = null
  killed = false

  kill(): boolean {
    this.killed = true
    this.exitCode = 0
    this.emit("exit", 0, null)
    return true
  }

  exit(code: number | null, signal: string | null = null): void {
    this.exitCode = code
    this.emit("exit", code, signal)
  }
}

function makeClient(onNotification?: (method: string, params: Record<string, unknown>) => void) {
  const proc = new FakeProcess()
  const client = new RexdRpcClient("test", proc as unknown as RpcProcess, onNotification)
  return { proc, client }
}

describe("RexdRpcClient", () => {
  test("demuxes NDJSON responses", async () => {
    const { proc, client } = makeClient()
    proc.stdin.once("data", (chunk) => {
      const request = JSON.parse(String(chunk))
      expect(request.method).toBe("session.open")
      proc.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { ok: true } })}\n`)
    })

    await expect(client.request("session.open", { client_name: "test" }, 1000)).resolves.toEqual({ ok: true })
    client.close()
  })

  test("dispatches notifications without ids", async () => {
    const notifications: Array<{ method: string; params: Record<string, unknown> }> = []
    const { proc, client } = makeClient((method, params) => notifications.push({ method, params }))
    proc.stdout.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "exec.stdout", params: { process_id: "p_1", data: "hi" } })}\n`,
    )
    await Bun.sleep(0)
    expect(notifications).toEqual([{ method: "exec.stdout", params: { process_id: "p_1", data: "hi" } }])
    client.close()
  })

  test("times out pending requests", async () => {
    const { client } = makeClient()
    await expect(client.request("slow", {}, 5)).rejects.toThrow("timed out")
    client.close()
  })

  test("connection close rejects pending requests", async () => {
    const { client } = makeClient()
    const pending = client.request("session.open", {}, 1000)
    client.close("boom")
    await expect(pending).rejects.toThrow("boom")
  })
})
