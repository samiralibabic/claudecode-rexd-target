import { posix } from "node:path"
import type { TargetConfig } from "./types"

export class RemotePathError extends Error {
  override name = "RemotePathError"
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

export function normalizeRemotePath(input: string): string {
  const normalized = posix.normalize(input || "/")
  if (normalized === ".") return "/"
  return normalized.startsWith("/") ? normalized : `/${normalized}`
}

export function resolveRemotePath(cwd: string, inputPath: string | undefined, target?: TargetConfig): string {
  const path = inputPath || cwd || "/"
  if (path === "~" || path.startsWith("~/")) {
    if (!target?.homeDir) {
      throw new RemotePathError("File paths beginning with '~' are not supported unless the target config sets homeDir.")
    }
    return normalizeRemotePath(posix.join(target.homeDir, path === "~" ? "" : path.slice(2)))
  }
  if (path.startsWith("/")) return normalizeRemotePath(path)
  return normalizeRemotePath(posix.join(cwd || "/", path))
}

export function inRoot(path: string, root: string): boolean {
  const normalizedPath = normalizeRemotePath(path)
  const normalizedRoot = normalizeRemotePath(root)
  if (normalizedRoot === "/") return true
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`)
}

export function allowedRootsFor(target: TargetConfig, workspaceRoots: string[]): string[] {
  const roots = [...(target.workspaceRoots ?? []), ...workspaceRoots, ...(target.rootPolicy?.extraRoots ?? [])]
    .filter(Boolean)
    .map(normalizeRemotePath)
  return [...new Set(roots)]
}

export function guardRemotePath(target: TargetConfig, path: string, workspaceRoots: string[]): string | null {
  const mode = target.rootPolicy?.mode ?? "strict"
  if (mode === "allow_within_server_roots") return null

  const roots = allowedRootsFor(target, workspaceRoots)
  if (roots.length === 0) return null
  if (roots.some((root) => inRoot(path, root))) return null

  const prefix = mode === "ask_on_escape" ? "Interactive ask_on_escape is not implemented in v0.1. " : ""
  return `${prefix}Path "${normalizeRemotePath(path)}" is outside allowed roots: ${roots.join(", ")}`
}

export function assertRemotePathAllowed(target: TargetConfig, path: string, workspaceRoots: string[]): void {
  const error = guardRemotePath(target, path, workspaceRoots)
  if (error) throw new RemotePathError(error)
}

function globStaticPrefix(pattern: string): string {
  const special = pattern.search(/[\*\?\[]/)
  const prefix = special === -1 ? pattern : pattern.slice(0, special)
  const slash = prefix.lastIndexOf("/")
  if (slash <= 0) return "/"
  return prefix.slice(0, slash)
}

export function guardRemoteGlob(target: TargetConfig, cwd: string, pattern: string, workspaceRoots: string[]): void {
  const pathToGuard = pattern.startsWith("/") ? globStaticPrefix(pattern) : cwd
  assertRemotePathAllowed(target, normalizeRemotePath(pathToGuard), workspaceRoots)
}

export function guardPatchText(target: TargetConfig, cwd: string, patchText: string, workspaceRoots: string[]): void {
  const paths: string[] = []
  for (const line of patchText.split("\n")) {
    const match = line.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/) || line.match(/^\*\*\* Move to: (.+)$/)
    if (match?.[1]) paths.push(match[1].trim())
  }

  for (const path of paths) {
    assertRemotePathAllowed(target, resolveRemotePath(cwd, path, target), workspaceRoots)
  }
}

export function formatLineNumbered(content: string, offset = 1, limit?: number): string {
  const start = Math.max(1, offset)
  const lines = content.split("\n")
  const startIndex = start - 1
  const endIndex = limit && limit > 0 ? startIndex + limit : undefined
  return lines
    .slice(startIndex, endIndex)
    .map((line, index) => `${start + index}: ${line}`)
    .join("\n")
}

export function formatListEntries(entries: Array<{ name?: string; type?: string; path?: string }>): string {
  if (entries.length === 0) return "(empty)"
  return entries
    .map((entry) => {
      const name = entry.name || entry.path || "(unknown)"
      return entry.type === "dir" ? `${name}/` : name
    })
    .join("\n")
}
