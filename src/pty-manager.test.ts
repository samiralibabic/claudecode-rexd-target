import { describe, expect, test } from "bun:test"
import { PtyManager } from "./pty-manager"

describe("PtyManager", () => {
  test("buffers, reads, and drains output", () => {
    const manager = new PtyManager(1024)
    manager.markOpen("pty_1", "p_1")
    manager.handleNotification("pty.output", { pty_id: "pty_1", data: "hello\n", encoding: "utf8" })

    expect(manager.read("pty_1", 1024, false).output).toBe("hello\n")
    expect(manager.read("pty_1", 1024, true).output).toBe("hello\n")
    expect(manager.read("pty_1", 1024, true).output).toBe("")
  })

  test("caps buffers and records exit status", () => {
    const manager = new PtyManager(5)
    manager.markOpen("pty_1", "p_1")
    manager.append("pty_1", "12345")
    manager.append("pty_1", "67890")
    const read = manager.read("pty_1", 1024, false)
    expect(read.output).toBe("67890")
    expect(read.state.truncated).toBe(true)

    manager.handleNotification("pty.exit", { pty_id: "pty_1", exit_code: 0 })
    expect(manager.list()[0].closed).toBe(true)
    expect(manager.list()[0].exitCode).toBe(0)
  })

  test("read and close on unknown pty id fail explicitly", () => {
    const manager = new PtyManager(1024)
    expect(() => manager.read("missing")).toThrow("Unknown PTY id: missing")
    expect(() => manager.close("missing")).toThrow("Unknown PTY id: missing")
    expect(() => manager.requireKnown("missing")).toThrow("Unknown PTY id: missing")
  })
})
