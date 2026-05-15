import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, join } from "node:path"
import { setActiveTarget } from "./state"

const script = resolve(import.meta.dir, "../scripts/guard-local-tools.mjs")

function runHook(input: unknown, env: Record<string, string | undefined> = {}) {
  const nextEnv = {
    ...process.env,
    CLAUDE_REXD_PROJECT_DIR: "",
    CLAUDE_PROJECT_DIR: "",
    ...env,
  }
  return spawnSync(process.execPath, [script], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: nextEnv,
  })
}

describe("guard-local-tools hook", () => {
  test("allows local tools when no active target exists", () => {
    const project = mkdtempSync(join(tmpdir(), "rexd-hook-"))
    mkdirSync(join(project, ".claude"))
    const result = runHook({ tool_name: "Read" }, { CLAUDE_REXD_PROJECT_DIR: project })
    expect(result.status).toBe(0)
    expect(result.stdout).toBe("")
  })

  test("denies local built-ins when a target is active", () => {
    const project = mkdtempSync(join(tmpdir(), "rexd-hook-"))
    const claudeDir = join(project, ".claude")
    mkdirSync(claudeDir)
    writeFileSync(
      join(claudeDir, "rexd-state.json"),
      JSON.stringify({ activeTargetAlias: "prod", lastUsedAt: Date.now(), projectKey: project, stateLocation: "repo-local" }),
    )

    const result = runHook({ tool_name: "Read" }, { CLAUDE_REXD_PROJECT_DIR: project })
    expect(result.status).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(output.hookSpecificOutput.permissionDecision).toBe("deny")
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain("mcp__rexd-target__read_file")
  })

  test("fails closed when state file is corrupt", () => {
    const project = mkdtempSync(join(tmpdir(), "rexd-hook-"))
    const claudeDir = join(project, ".claude")
    mkdirSync(claudeDir)
    writeFileSync(join(claudeDir, "rexd-state.json"), "{")

    const result = runHook({ tool_name: "Bash" }, { CLAUDE_REXD_PROJECT_DIR: project })
    expect(result.status).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(output.hookSpecificOutput.permissionDecision).toBe("deny")
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain("could not be parsed")
  })

  test("uses cwd from hook payload before process cwd", () => {
    const project = mkdtempSync(join(tmpdir(), "rexd-hook-"))
    mkdirSync(join(project, ".claude"))
    setActiveTarget("prod", { cwd: project, env: {} as NodeJS.ProcessEnv })

    const result = runHook({ tool_name: "Read", cwd: project })
    expect(result.status).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(output.hookSpecificOutput.permissionDecision).toBe("deny")
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain('REXD target "prod"')
  })
})
