import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { connectionManager, type ConnectionManager } from "../connection-manager"
import { getTargetsFilePath, loadTargetsFile, validateUsableSshTarget } from "../config"
import { clearActiveTarget, loadState, saveState } from "../state"
import type { Connection, TargetConfig } from "../types"
import { formatJson, safeTool, textResult } from "./common"

function summarizeTarget(alias: string, target: TargetConfig, active: boolean) {
  return {
    alias,
    active,
    host: target.host ?? "",
    user: target.user,
    defaultCwd: target.defaultCwd,
    workspaceRoots: target.workspaceRoots,
    description: target.description,
    capabilities: target.capabilities,
  }
}

function connectionSummary(connection?: Connection) {
  if (!connection) return { connected: false }
  return {
    connected: true,
    sessionId: connection.remoteSessionID,
    protocol: connection.protocol,
    serverVersion: connection.serverVersion,
    capabilities: connection.capabilities,
    remoteCwd: connection.cwd,
    workspaceRoots: connection.workspaceRoots,
    openedAt: connection.openedAt,
    lastUsedAt: connection.lastUsedAt,
  }
}

export function registerTargetTools(server: McpServer, manager: ConnectionManager = connectionManager): void {
  server.registerTool(
    "target_list",
    {
      title: "List REXD Targets",
      description: "List configured REXD targets and show which one is active for this Claude project.",
      inputSchema: {},
    },
    async () =>
      safeTool(() => {
        const { state, resolved } = loadState()
        const { targetsFile, path } = loadTargetsFile(getTargetsFilePath())
        const targets = Object.entries(targetsFile.targets).map(([alias, target]) =>
          summarizeTarget(alias, target, alias === state.activeTargetAlias),
        )
        const result = { targets, targetsFile: path, statePath: resolved.statePath }
        return textResult(targets.length ? formatJson(result) : "No targets configured.", result)
      }),
  )

  server.registerTool(
    "target_use",
    {
      title: "Use REXD Target",
      description: "Activate a configured SSH REXD target and open a session immediately.",
      inputSchema: { alias: z.string().min(1) },
    },
    async ({ alias }) =>
      safeTool(async () => {
        const { targetsFile, path: targetsPath } = loadTargetsFile(getTargetsFilePath())
        const target = targetsFile.targets[alias]
        if (!target) throw new Error(`Unknown target: ${alias}`)
        validateUsableSshTarget(alias, target)

        const { state, resolved } = loadState()
        const remoteCwdOverride = state.activeTargetAlias === alias ? state.remoteCwdOverride : null
        const connection = await manager.openForTarget(resolved.projectKey, alias, target, remoteCwdOverride)
        manager.closeProjectExcept(resolved.projectKey, alias)

        const saved = saveState({
          ...state,
          activeTargetAlias: alias,
          remoteCwdOverride,
          lastUsedAt: Date.now(),
        })

        const warnings: string[] = []
        if (connection.protocol && connection.protocol !== "rexd/1") {
          warnings.push(`Expected protocol rexd/1, server reported ${connection.protocol}`)
        }
        if (!connection.capabilities || connection.capabilities.length === 0) {
          warnings.push("Server did not report capabilities; old rexd versions may be missing required methods.")
        }

        const result = {
          activeTargetAlias: alias,
          target: summarizeTarget(alias, target, true),
          remoteCwd: connection.cwd,
          workspaceRoots: connection.workspaceRoots,
          statePath: saved.resolved.statePath,
          targetsFile: targetsPath,
          connection: connectionSummary(connection),
          warnings,
        }
        return textResult(`Active REXD target: ${alias}\n${formatJson(result)}`, result)
      }),
  )

  server.registerTool(
    "target_status",
    {
      title: "REXD Target Status",
      description: "Show active target, state path, and current connection status.",
      inputSchema: {},
    },
    async () =>
      safeTool(() => {
        const { state, resolved } = loadState()
        const targetsPath = getTargetsFilePath()
        if (!state.activeTargetAlias) {
          const result = {
            activeTargetAlias: null,
            statePath: resolved.statePath,
            stateLocation: resolved.stateLocation,
            projectKey: resolved.projectKey,
            targetsFile: targetsPath,
            connection: { connected: false },
          }
          return textResult("No active REXD target.", result)
        }

        const { targetsFile } = loadTargetsFile(targetsPath)
        const target = targetsFile.targets[state.activeTargetAlias]
        if (!target) throw new Error(`Active target "${state.activeTargetAlias}" is no longer configured.`)

        const status = manager.status(resolved.projectKey, state.activeTargetAlias)
        const result = {
          activeTargetAlias: state.activeTargetAlias,
          target: summarizeTarget(state.activeTargetAlias, target, true),
          statePath: resolved.statePath,
          stateLocation: resolved.stateLocation,
          projectKey: resolved.projectKey,
          targetsFile: targetsPath,
          remoteCwd: status.connection?.cwd ?? state.remoteCwdOverride ?? target.defaultCwd ?? target.workspaceRoots?.[0] ?? "/",
          connection: connectionSummary(status.connection),
        }
        return textResult(formatJson(result), result)
      }),
  )

  server.registerTool(
    "target_clear",
    {
      title: "Clear REXD Target",
      description: "Deactivate the current REXD target and close the active connection for this project.",
      inputSchema: {},
    },
    async () =>
      safeTool(() => {
        const { state, resolved } = loadState()
        if (state.activeTargetAlias) {
          manager.closeByAlias(resolved.projectKey, state.activeTargetAlias, "Target cleared")
        }
        const cleared = clearActiveTarget()
        const result = {
          activeTargetAlias: null,
          previousTargetAlias: state.activeTargetAlias,
          statePath: cleared.resolved.statePath,
          stateLocation: cleared.resolved.stateLocation,
          projectKey: cleared.resolved.projectKey,
        }
        return textResult("Cleared active REXD target. Local built-in tools are no longer blocked by this plugin.", result)
      }),
  )
}
