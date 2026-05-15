import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, join } from "node:path"

const script = resolve(import.meta.dir, "../scripts/guard-local-tools.mjs")

function runHook(project: string, input: unknown) {
  return spawnSync(process.execPath, [script], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: {
      ...process.env,
      CLAUDE_REXD_PROJECT_DIR: project,
    },
  })
}

describe("guard-local-tools hook", () => {
  test("allows local tools when no active target exists", () => {
    const project = mkdtempSync(join(tmpdir(), "rexd-hook-"))
    mkdirSync(join(project, ".claude"))
    const result = runHook(project, { tool_name: "Read" })
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

    const result = runHook(project, { tool_name: "Read" })
    expect(result.status).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(output.hookSpecificOutput.permissionDecision).toBe("deny")
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain("mcp__rexd-target__read_file")
  })
})
