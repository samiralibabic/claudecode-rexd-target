import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { clearActiveTarget, loadState, resolveStatePath, setActiveTarget } from "./state"

describe("state", () => {
  test("uses repo-local state when .claude exists", () => {
    const project = mkdtempSync(join(tmpdir(), "rexd-project-"))
    mkdirSync(join(project, ".claude"))
    const resolved = resolveStatePath({ env: { CLAUDE_REXD_PROJECT_DIR: project } as NodeJS.ProcessEnv })
    expect(resolved.stateLocation).toBe("repo-local")
    expect(resolved.statePath).toBe(join(project, ".claude", "rexd-state.json"))
  })

  test("uses global cache keyed by real project path", () => {
    const root = mkdtempSync(join(tmpdir(), "rexd-state-root-"))
    const project = join(root, "project")
    const link = join(root, "project-link")
    const cacheRoot = join(root, "cache")
    mkdirSync(project)
    symlinkSync(project, link, "dir")

    const first = resolveStatePath({ env: { CLAUDE_REXD_PROJECT_DIR: project } as NodeJS.ProcessEnv, cacheRoot })
    const second = resolveStatePath({ env: { CLAUDE_REXD_PROJECT_DIR: link } as NodeJS.ProcessEnv, cacheRoot })
    expect(first.stateLocation).toBe("global-cache")
    expect(first.statePath).toBe(second.statePath)
    expect(first.statePath.startsWith(cacheRoot)).toBe(true)
  })

  test("clear preserves project metadata and writes state", () => {
    const project = mkdtempSync(join(tmpdir(), "rexd-project-"))
    mkdirSync(join(project, ".claude"))
    const options = { env: { CLAUDE_REXD_PROJECT_DIR: project } as NodeJS.ProcessEnv }

    const active = setActiveTarget("prod", options)
    expect(active.state.activeTargetAlias).toBe("prod")
    expect(existsSync(active.resolved.statePath)).toBe(true)

    const cleared = clearActiveTarget(options)
    const parsed = JSON.parse(readFileSync(cleared.resolved.statePath, "utf8"))
    expect(parsed.activeTargetAlias).toBeNull()
    expect(parsed.projectKey).toBe(active.state.projectKey)
    expect(parsed.stateLocation).toBe("repo-local")
  })

  test("rejects structurally invalid persisted state", () => {
    const project = mkdtempSync(join(tmpdir(), "rexd-project-"))
    mkdirSync(join(project, ".claude"))
    const options = { env: { CLAUDE_REXD_PROJECT_DIR: project } as NodeJS.ProcessEnv }
    const resolved = resolveStatePath(options)
    writeFileSync(resolved.statePath, JSON.stringify({ activeTargetAlias: 123 }))

    expect(() => loadState(options)).toThrow("activeTargetAlias must be a non-empty string or null")
  })
})
