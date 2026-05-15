#!/usr/bin/env node
import { createHash } from "node:crypto"
import { existsSync, readFileSync, realpathSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

function readStdin() {
  return new Promise((resolve) => {
    let data = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => {
      data += chunk
    })
    process.stdin.on("end", () => resolve(data))
  })
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

function safeRealpath(value) {
  try {
    return realpathSync.native(value)
  } catch {
    return realpathSync(value)
  }
}

function usablePath(value) {
  return typeof value === "string" && value.length > 0 && !value.includes("${") ? value : undefined
}

function payloadProjectRoot(input) {
  return [
    input?.project_cwd,
    input?.projectCwd,
    input?.project_dir,
    input?.projectDir,
    input?.workspace_root,
    input?.workspaceRoot,
    input?.cwd,
  ].find(usablePath)
}

function resolveStatePath(input) {
  const projectEnv = [process.env.CLAUDE_REXD_PROJECT_DIR, process.env.CLAUDE_PROJECT_DIR].find(
    usablePath,
  )
  const projectRoot = path.resolve(projectEnv || payloadProjectRoot(input) || process.cwd())
  const projectKey = safeRealpath(projectRoot)
  const repoClaudeDir = path.resolve(projectRoot, ".claude")
  if (existsSync(repoClaudeDir)) return path.resolve(repoClaudeDir, "rexd-state.json")
  return path.resolve(homedir(), ".cache/claudecode-rexd-target/state", `${sha256(projectKey)}.json`)
}

function loadState(input) {
  const statePath = resolveStatePath(input)
  if (!existsSync(statePath)) return { statePath, activeAlias: null, parseError: null }
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8"))
    const activeAlias =
      typeof parsed.activeTargetAlias === "string" && parsed.activeTargetAlias.length > 0
        ? parsed.activeTargetAlias
        : null
    return { statePath, activeAlias, parseError: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { statePath, activeAlias: null, parseError: message }
  }
}

function toolNameFromInput(input) {
  return String(input?.tool_name || input?.toolName || input?.tool || "local tool")
}

function suggestionFor(toolName) {
  switch (toolName) {
    case "Bash":
      return "mcp__rexd-target__exec or PTY tools"
    case "Read":
      return "mcp__rexd-target__read_file"
    case "Write":
      return "mcp__rexd-target__write_file"
    case "Edit":
    case "MultiEdit":
      return "mcp__rexd-target__edit_file or mcp__rexd-target__apply_patch"
    case "Glob":
      return "mcp__rexd-target__glob"
    case "Grep":
      return "mcp__rexd-target__grep"
    default:
      return "the rexd-target MCP tools"
  }
}

const inputText = await readStdin()
let input = {}
try {
  input = inputText.trim() ? JSON.parse(inputText) : {}
} catch {
  input = {}
}

const state = loadState(input)
if (!state.activeAlias && !state.parseError) process.exit(0)

const toolName = toolNameFromInput(input)
const reason = state.parseError
  ? `Local ${toolName} blocked because REXD state file exists but could not be parsed at ${state.statePath}. Fix or remove the corrupt state file before using local tools. Parse error: ${state.parseError}`
  : `Local ${toolName} blocked because REXD target "${state.activeAlias}" is active. Use ${suggestionFor(toolName)} instead.`

process.stdout.write(
  `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  })}\n`,
)
