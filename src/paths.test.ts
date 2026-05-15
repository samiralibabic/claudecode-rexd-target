import { describe, expect, test } from "bun:test"
import { guardPatchText, guardRemotePath, normalizeRemotePath, resolveRemotePath, shellQuote } from "./paths"
import type { TargetConfig } from "./types"

const strictTarget: TargetConfig = {
  transport: "ssh",
  host: "example.com",
  workspaceRoots: ["/srv/app"],
  rootPolicy: { mode: "strict", extraRoots: ["/tmp/app"] },
}

describe("paths", () => {
  test("normalizes and resolves POSIX remote paths", () => {
    expect(normalizeRemotePath("/srv/app/../app/file.txt")).toBe("/srv/app/file.txt")
    expect(resolveRemotePath("/srv/app", "src/index.ts")).toBe("/srv/app/src/index.ts")
    expect(resolveRemotePath("/srv/app", "/etc/hosts")).toBe("/etc/hosts")
  })

  test("rejects tilde file paths unless homeDir is configured", () => {
    expect(() => resolveRemotePath("/srv/app", "~/file.txt")).toThrow("homeDir")
    expect(resolveRemotePath("/srv/app", "~/file.txt", { transport: "ssh", homeDir: "/home/deploy" })).toBe(
      "/home/deploy/file.txt",
    )
  })

  test("guards strict roots", () => {
    expect(guardRemotePath(strictTarget, "/srv/app/src/index.ts", [])).toBeNull()
    expect(guardRemotePath(strictTarget, "/tmp/app/file.txt", [])).toBeNull()
    expect(guardRemotePath(strictTarget, "/etc/passwd", [])).toContain("outside allowed roots")
  })

  test("treats root workspace as allowing absolute descendants", () => {
    const target: TargetConfig = { ...strictTarget, workspaceRoots: ["/"] }
    expect(guardRemotePath(target, "/etc/hosts", [])).toBeNull()
  })

  test("allow_within_server_roots lets rexd decide", () => {
    const target: TargetConfig = { ...strictTarget, rootPolicy: { mode: "allow_within_server_roots" } }
    expect(guardRemotePath(target, "/etc/passwd", [])).toBeNull()
  })

  test("guards patch paths", () => {
    expect(() =>
      guardPatchText(strictTarget, "/srv/app", "*** Begin Patch\n*** Update File: src/a.txt\n@@\n-a\n+b\n*** End Patch", []),
    ).not.toThrow()
    expect(() =>
      guardPatchText(strictTarget, "/srv/app", "*** Begin Patch\n*** Update File: ../escape.txt\n@@\n-a\n+b\n*** End Patch", []),
    ).toThrow("outside allowed roots")
  })

  test("shell quotes safely", () => {
    expect(shellQuote("a'b")).toBe("'a'\\''b'")
  })
})
