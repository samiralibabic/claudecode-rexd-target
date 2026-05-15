import { getTarget, validateUsableSshTarget } from "./config"
import { ExecManager } from "./exec-manager"
import { normalizeRemotePath } from "./paths"
import { PtyManager } from "./pty-manager"
import { createSshRexdRpcClient } from "./rpc"
import { loadState, touchState, type ResolveStateOptions } from "./state"
import type { Connection, SessionOpenResult, TargetConfig } from "./types"
import { CLIENT_NAME, CLIENT_VERSION } from "./version"

const SESSION_OPEN_TIMEOUT_MS = 20000

export class ConnectionError extends Error {
  override name = "ConnectionError"
}

export function connectionKey(projectKey: string, alias: string): string {
  return `${projectKey}::${alias}`
}

export class ConnectionManager {
  private connections = new Map<string, Connection>()

  get(projectKey: string, alias: string): Connection | undefined {
    const connection = this.connections.get(connectionKey(projectKey, alias))
    if (connection && connection.rpc.isAlive()) return connection
    if (connection) this.close(connection, "Connection is no longer active")
    return undefined
  }

  status(projectKey: string, alias: string): { connected: boolean; connection?: Connection } {
    const connection = this.get(projectKey, alias)
    return { connected: Boolean(connection), connection }
  }

  async openForTarget(
    projectKey: string,
    alias: string,
    target: TargetConfig,
    remoteCwdOverride?: string | null,
  ): Promise<Connection> {
    validateUsableSshTarget(alias, target)

    const key = connectionKey(projectKey, alias)
    const existing = this.connections.get(key)
    if (existing && existing.rpc.isAlive()) return existing
    if (existing) this.close(existing, "Reopening inactive connection")

    const execManager = new ExecManager()
    const ptyManager = new PtyManager()
    const rpc = createSshRexdRpcClient(alias, target, (method, params) => {
      if (execManager.handleNotification(method, params)) return
      ptyManager.handleNotification(method, params)
    })

    const connection: Connection = {
      key,
      alias,
      projectKey,
      target,
      rpc,
      remoteSessionID: "",
      cwd: normalizeRemotePath(remoteCwdOverride || target.defaultCwd || "/"),
      workspaceRoots: (target.workspaceRoots ?? []).map(normalizeRemotePath),
      execManager,
      ptyManager,
      openedAt: Date.now(),
      lastUsedAt: Date.now(),
    }
    this.connections.set(key, connection)

    try {
      const session = await rpc.request<SessionOpenResult>(
        "session.open",
        {
          client_name: CLIENT_NAME,
          client_version: CLIENT_VERSION,
          workspace_roots: target.workspaceRoots ?? [],
        },
        SESSION_OPEN_TIMEOUT_MS,
      )

      connection.remoteSessionID = String(session.session_id ?? "")
      if (!connection.remoteSessionID) {
        throw new ConnectionError("session.open failed: missing session_id")
      }

      connection.protocol = session.protocol
      connection.serverVersion = session.server_version
      connection.capabilities = Array.isArray(session.capabilities) ? session.capabilities : undefined
      connection.limits = session.limits
      connection.workspaceRoots = Array.isArray(session.workspace_roots)
        ? session.workspace_roots.map(normalizeRemotePath)
        : connection.workspaceRoots
      connection.cwd = normalizeRemotePath(
        remoteCwdOverride || target.defaultCwd || connection.workspaceRoots[0] || "/",
      )
      return connection
    } catch (err) {
      this.close(connection, err instanceof Error ? err.message : String(err))
      throw err
    }
  }

  async ensureActiveConnection(options: ResolveStateOptions = {}): Promise<{ connection: Connection; statePath: string }> {
    const { state, resolved } = loadState(options)
    if (!state.activeTargetAlias) {
      throw new ConnectionError("No active REXD target. Use target_list then target_use.")
    }

    const target = getTarget(state.activeTargetAlias)
    validateUsableSshTarget(state.activeTargetAlias, target)
    touchState(options)

    const existing = this.get(resolved.projectKey, state.activeTargetAlias)
    if (existing) {
      existing.lastUsedAt = Date.now()
      return { connection: existing, statePath: resolved.statePath }
    }

    const connection = await this.openForTarget(
      resolved.projectKey,
      state.activeTargetAlias,
      target,
      state.remoteCwdOverride,
    )
    return { connection, statePath: resolved.statePath }
  }

  close(connection: Connection, reason = "Connection closed"): void {
    connection.execManager.rejectAll(reason)
    connection.rpc.close(reason)
    this.connections.delete(connection.key)
  }

  closeByAlias(projectKey: string, alias: string, reason = "Connection closed"): void {
    const connection = this.connections.get(connectionKey(projectKey, alias))
    if (connection) this.close(connection, reason)
  }

  closeProjectExcept(projectKey: string, keepAlias: string): void {
    for (const connection of this.connections.values()) {
      if (connection.projectKey === projectKey && connection.alias !== keepAlias) {
        this.close(connection, "Target switched")
      }
    }
  }
}

export const connectionManager = new ConnectionManager()
