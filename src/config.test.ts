import { describe, expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ConfigError, expandHome, getTargetsFilePath, loadTargetsFile } from "./config"

describe("config", () => {
  test("loads valid targets", () => {
    const dir = mkdtempSync(join(tmpdir(), "rexd-config-"))
    const file = join(dir, "targets.json")
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        targets: {
          prod: {
            transport: "ssh",
            host: "example.com",
            user: "deploy",
            workspaceRoots: ["/srv/app"],
          },
        },
      }),
    )

    const { targetsFile, path } = loadTargetsFile(file)
    expect(path).toBe(file)
    expect(targetsFile.targets.prod.host).toBe("example.com")
  })

  test("handles missing and malformed registries visibly", () => {
    expect(() => loadTargetsFile(join(tmpdir(), "missing-targets.json"))).toThrow(ConfigError)

    const dir = mkdtempSync(join(tmpdir(), "rexd-config-"))
    const file = join(dir, "targets.json")
    writeFileSync(file, "{")
    expect(() => loadTargetsFile(file)).toThrow("not valid JSON")
  })

  test("expands home paths", () => {
    expect(expandHome("~/.ssh/id", "/home/test")).toBe("/home/test/.ssh/id")
    expect(getTargetsFilePath({ REXD_TARGETS_FILE: "~/targets.json" } as NodeJS.ProcessEnv, "/home/test")).toBe(
      "/home/test/targets.json",
    )
  })
})
