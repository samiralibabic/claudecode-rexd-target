import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, join } from "node:path"
import { setActiveTarget } from "./state"

const script = resolve(import.meta.dir, "../scripts/guard-local-tools.mjs")
const hooksManifest = resolve(import.meta.dir, "../hooks/hooks.json")
const mcp = "mcp__plugin_claudecode-rexd-target_rexd-target__"

const guardedTools = [
  ["Bash", `${mcp}exec or PTY tools`],
  ["PowerShell", `${mcp}exec or PTY tools`],
  ["Read", `${mcp}read_file`],
  ["Write", `${mcp}write_file`],
  ["Edit", `${mcp}edit_file or ${mcp}apply_patch`],
  ["MultiEdit", `${mcp}edit_file or ${mcp}apply_patch`],
  ["NotebookEdit", `${mcp}edit_file or ${mcp}apply_patch`],
  ["Glob", `${mcp}glob`],
  ["Grep", `${mcp}grep`],
  ["LSP", `${mcp}exec to run language-server tooling on the target`],
  ["Monitor", `${mcp}exec_start, ${mcp}exec_wait, or PTY tools`],
] as const

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
  test("registers every guarded tool with an exec-form Node hook", () => {
    const manifest = JSON.parse(readFileSync(hooksManifest, "utf8"))
    const preToolUse = manifest.hooks.PreToolUse[0]
    expect(preToolUse.matcher).toBe(guardedTools.map(([toolName]) => toolName).join("|"))
    expect(preToolUse.hooks).toEqual([
      {
        type: "command",
        command: "node",
        args: ["${CLAUDE_PLUGIN_ROOT}/scripts/guard-local-tools.mjs"],
      },
    ])
  })

  test("allows local tools when no active target exists", () => {
    const project = mkdtempSync(join(tmpdir(), "rexd-hook-"))
    mkdirSync(join(project, ".claude"))
    const result = runHook({ tool_name: "Read" }, { CLAUDE_REXD_PROJECT_DIR: project })
    expect(result.status).toBe(0)
    expect(result.stdout).toBe("")
  })

  test.each(guardedTools)("denies %s when a target is active", (toolName, suggestion) => {
    const project = mkdtempSync(join(tmpdir(), "rexd-hook-"))
    const claudeDir = join(project, ".claude")
    mkdirSync(claudeDir)
    writeFileSync(
      join(claudeDir, "rexd-state.json"),
      JSON.stringify({ activeTargetAlias: "prod", lastUsedAt: Date.now(), projectKey: project, stateLocation: "repo-local" }),
    )

    const result = runHook({ tool_name: toolName }, { CLAUDE_REXD_PROJECT_DIR: project })
    expect(result.status).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(output.hookSpecificOutput.permissionDecision).toBe("deny")
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain(suggestion)
  })

  test.each(guardedTools)("fails closed for %s when state file is corrupt", (toolName) => {
    const project = mkdtempSync(join(tmpdir(), "rexd-hook-"))
    const claudeDir = join(project, ".claude")
    mkdirSync(claudeDir)
    writeFileSync(join(claudeDir, "rexd-state.json"), "{")

    const result = runHook({ tool_name: toolName }, { CLAUDE_REXD_PROJECT_DIR: project })
    expect(result.status).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(output.hookSpecificOutput.permissionDecision).toBe("deny")
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain("could not be parsed")
  })

  test("fails closed when state JSON has an invalid structure", () => {
    const project = mkdtempSync(join(tmpdir(), "rexd-hook-"))
    const claudeDir = join(project, ".claude")
    mkdirSync(claudeDir)
    writeFileSync(join(claudeDir, "rexd-state.json"), JSON.stringify({ activeTargetAlias: 123 }))

    const result = runHook({ tool_name: "Read" }, { CLAUDE_REXD_PROJECT_DIR: project })
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
