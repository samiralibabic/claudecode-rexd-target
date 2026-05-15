import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"
import type { TargetConfig, TargetsFile } from "./types"

export class ConfigError extends Error {
  override name = "ConfigError"
}

export function expandHome(value: string, homeDir = homedir()): string {
  if (value === "~") return homeDir
  if (value.startsWith("~/")) return resolve(homeDir, value.slice(2))
  return value
}

export function getTargetsFilePath(env: NodeJS.ProcessEnv = process.env, homeDir = homedir()): string {
  return expandHome(env.REXD_TARGETS_FILE || "~/.config/rexd/targets.json", homeDir)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validateTarget(alias: string, value: unknown): TargetConfig {
  if (!isRecord(value)) {
    throw new ConfigError(`Target "${alias}" must be an object`)
  }

  const transport = value.transport
  if (typeof transport !== "string" || transport.length === 0) {
    throw new ConfigError(`Target "${alias}" is missing string field "transport"`)
  }

  if (value.workspaceRoots !== undefined && !Array.isArray(value.workspaceRoots)) {
    throw new ConfigError(`Target "${alias}" field "workspaceRoots" must be an array`)
  }

  if (value.sshOptions !== undefined && !Array.isArray(value.sshOptions)) {
    throw new ConfigError(`Target "${alias}" field "sshOptions" must be an array`)
  }

  if (value.port !== undefined && typeof value.port !== "number") {
    throw new ConfigError(`Target "${alias}" field "port" must be a number`)
  }

  return value as TargetConfig
}

export function loadTargetsFile(
  filePath = getTargetsFilePath(),
): { targetsFile: TargetsFile; path: string } {
  if (!existsSync(filePath)) {
    throw new ConfigError(`Target registry not found: ${filePath}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new ConfigError(`Target registry is not valid JSON: ${filePath}: ${message}`)
  }

  if (!isRecord(parsed)) {
    throw new ConfigError(`Target registry must be a JSON object: ${filePath}`)
  }

  const rawTargets = parsed.targets
  if (!isRecord(rawTargets)) {
    throw new ConfigError(`Target registry must contain a "targets" object: ${filePath}`)
  }

  const targets: Record<string, TargetConfig> = {}
  for (const [alias, target] of Object.entries(rawTargets)) {
    targets[alias] = validateTarget(alias, target)
  }

  return {
    path: filePath,
    targetsFile: {
      version: typeof parsed.version === "number" ? parsed.version : undefined,
      targets,
    },
  }
}

export function getTarget(alias: string, filePath = getTargetsFilePath()): TargetConfig {
  const { targetsFile } = loadTargetsFile(filePath)
  const target = targetsFile.targets[alias]
  if (!target) {
    throw new ConfigError(`Unknown target: ${alias}`)
  }
  return target
}

export function validateUsableSshTarget(alias: string, target: TargetConfig): void {
  if (target.transport !== "ssh") {
    throw new ConfigError(`Target "${alias}" uses transport "${target.transport}", but v0.1 supports only ssh.`)
  }
  if (!target.host) {
    throw new ConfigError(`Target "${alias}" is missing "host"`)
  }
}
