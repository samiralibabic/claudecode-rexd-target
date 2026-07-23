import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, resolve } from "node:path"
import type { ResolvedStatePath, RexdState } from "./types"

export class StateError extends Error {
  override name = "StateError"
}

export type ResolveStateOptions = {
  env?: NodeJS.ProcessEnv
  cwd?: string
  homeDir?: string
  cacheRoot?: string
}

function usableEnvPath(value: string | undefined): string | undefined {
  if (!value || value.includes("${")) return undefined
  return value
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function safeRealpath(value: string): string {
  try {
    return realpathSync.native(value)
  } catch {
    return realpathSync(value)
  }
}

export function resolveProjectRoot(options: ResolveStateOptions = {}): string {
  const env = options.env ?? process.env
  const cwd = options.cwd ?? process.cwd()
  return resolve(usableEnvPath(env.CLAUDE_REXD_PROJECT_DIR) || usableEnvPath(env.CLAUDE_PROJECT_DIR) || cwd)
}

export function resolveStatePath(options: ResolveStateOptions = {}): ResolvedStatePath {
  const homeDir = options.homeDir ?? homedir()
  const projectRoot = resolveProjectRoot(options)
  const projectKey = safeRealpath(projectRoot)
  const repoClaudeDir = resolve(projectRoot, ".claude")

  if (existsSync(repoClaudeDir)) {
    return {
      projectRoot,
      projectKey,
      statePath: resolve(repoClaudeDir, "rexd-state.json"),
      stateLocation: "repo-local",
    }
  }

  const cacheRoot = options.cacheRoot ?? resolve(homeDir, ".cache/claudecode-rexd-target/state")
  return {
    projectRoot,
    projectKey,
    statePath: resolve(cacheRoot, `${sha256(projectKey)}.json`),
    stateLocation: "global-cache",
  }
}

export function defaultState(resolved = resolveStatePath()): RexdState {
  return {
    activeTargetAlias: null,
    remoteCwdOverride: null,
    lastUsedAt: Date.now(),
    projectKey: resolved.projectKey,
    stateLocation: resolved.stateLocation,
  }
}

function normalizeState(value: Partial<RexdState>, resolved: ResolvedStatePath): RexdState {
  return {
    activeTargetAlias: value.activeTargetAlias ?? null,
    remoteCwdOverride: value.remoteCwdOverride ?? null,
    lastUsedAt: typeof value.lastUsedAt === "number" ? value.lastUsedAt : Date.now(),
    projectKey: resolved.projectKey,
    stateLocation: resolved.stateLocation,
  }
}

function validateStoredState(value: unknown, path: string): asserts value is Partial<RexdState> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StateError(`State file is invalid: ${path}: expected an object`)
  }
  const state = value as Record<string, unknown>
  if (!("activeTargetAlias" in state)) {
    throw new StateError(`State file is invalid: ${path}: missing activeTargetAlias`)
  }
  if (
    state.activeTargetAlias !== null &&
    (typeof state.activeTargetAlias !== "string" || state.activeTargetAlias.length === 0)
  ) {
    throw new StateError(`State file is invalid: ${path}: activeTargetAlias must be a non-empty string or null`)
  }
}

export function loadState(options: ResolveStateOptions = {}): { state: RexdState; resolved: ResolvedStatePath } {
  const resolved = resolveStatePath(options)
  if (!existsSync(resolved.statePath)) {
    return { state: defaultState(resolved), resolved }
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(resolved.statePath, "utf8"))
    validateStoredState(parsed, resolved.statePath)
    return { state: normalizeState(parsed, resolved), resolved }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new StateError(`State file is not valid JSON: ${resolved.statePath}: ${message}`)
  }
}

export function saveState(state: RexdState, options: ResolveStateOptions = {}): { state: RexdState; resolved: ResolvedStatePath } {
  const resolved = resolveStatePath(options)
  const normalized = normalizeState(state, resolved)
  mkdirSync(dirname(resolved.statePath), { recursive: true })
  writeFileSync(resolved.statePath, `${JSON.stringify(normalized, null, 2)}\n`)
  return { state: normalized, resolved }
}

export function setActiveTarget(alias: string, options: ResolveStateOptions = {}): { state: RexdState; resolved: ResolvedStatePath } {
  const { state } = loadState(options)
  return saveState(
    {
      ...state,
      activeTargetAlias: alias,
      lastUsedAt: Date.now(),
    },
    options,
  )
}

export function clearActiveTarget(options: ResolveStateOptions = {}): { state: RexdState; resolved: ResolvedStatePath } {
  const { state } = loadState(options)
  return saveState(
    {
      ...state,
      activeTargetAlias: null,
      remoteCwdOverride: null,
      lastUsedAt: Date.now(),
    },
    options,
  )
}

export function touchState(options: ResolveStateOptions = {}): { state: RexdState; resolved: ResolvedStatePath } {
  const { state } = loadState(options)
  return saveState({ ...state, lastUsedAt: Date.now() }, options)
}
