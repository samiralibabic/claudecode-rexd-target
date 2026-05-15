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

function resolveStatePath() {
  const projectEnv = [process.env.CLAUDE_REXD_PROJECT_DIR, process.env.CLAUDE_PROJECT_DIR].find(
    (value) => value && !value.includes("${"),
  )
  const projectRoot = path.resolve(projectEnv || process.cwd())
  const projectKey = safeRealpath(projectRoot)
  const repoClaudeDir = path.resolve(projectRoot, ".claude")
  if (existsSync(repoClaudeDir)) return path.resolve(repoClaudeDir, "rexd-state.json")
  return path.resolve(homedir(), ".cache/claudecode-rexd-target/state", `${sha256(projectKey)}.json`)
}

function loadActiveAlias() {
  const statePath = resolveStatePath()
  if (!existsSync(statePath)) return null
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8"))
    return typeof parsed.activeTargetAlias === "string" && parsed.activeTargetAlias.length > 0
      ? parsed.activeTargetAlias
      : null
  } catch {
    return null
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

const activeAlias = loadActiveAlias()
if (!activeAlias) process.exit(0)

const toolName = toolNameFromInput(input)
const reason = `Local ${toolName} blocked because REXD target "${activeAlias}" is active. Use ${suggestionFor(toolName)} instead.`

process.stdout.write(
  `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  })}\n`,
)
