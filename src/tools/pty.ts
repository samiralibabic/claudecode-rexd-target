import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { connectionManager, type ConnectionManager } from "../connection-manager"
import { assertRemotePathAllowed, resolveRemotePath } from "../paths"
import { formatJson, requireCapability, safeTool, textResult } from "./common"

export function registerPtyTools(server: McpServer, manager: ConnectionManager = connectionManager): void {
  server.registerTool(
    "pty_open",
    {
      title: "Open Remote PTY",
      description: "Open a remote interactive PTY on the active REXD target.",
      inputSchema: {
        command: z.string().optional(),
        cwd: z.string().optional(),
        cols: z.number().int().positive().optional(),
        rows: z.number().int().positive().optional(),
        login: z.boolean().optional(),
      },
    },
    async ({ command, cwd, cols, rows, login }) =>
      safeTool(async () => {
        const { connection } = await manager.ensureActiveConnection()
        requireCapability(connection.target.capabilities, "pty")
        const remoteCwd = resolveRemotePath(connection.cwd, cwd, connection.target)
        assertRemotePathAllowed(connection.target, remoteCwd, connection.workspaceRoots)
        const useLogin = login ?? connection.target.loginShell === true
        const remoteCommand = command ?? (useLogin ? "bash -l" : "bash")
        const result = await connection.rpc.request<{ pty_id?: string; process_id?: string }>("pty.open", {
          session_id: connection.remoteSessionID,
          command: remoteCommand,
          shell: true,
          cwd: remoteCwd,
          cols: cols ?? 120,
          rows: rows ?? 36,
          login: useLogin,
        })
        const ptyId = String(result.pty_id ?? "")
        if (!ptyId) throw new Error("pty.open failed: missing pty_id")
        const processId = typeof result.process_id === "string" ? result.process_id : undefined
        connection.ptyManager.markOpen(ptyId, processId)
        return textResult(`Opened remote PTY ${ptyId}`, { ptyId, processId, command: remoteCommand, cwd: remoteCwd })
      }),
  )

  server.registerTool(
    "pty_input",
    {
      title: "Remote PTY Input",
      description: "Send input to a remote PTY.",
      inputSchema: {
        ptyId: z.string().min(1),
        data: z.string(),
      },
    },
    async ({ ptyId, data }) =>
      safeTool(async () => {
        const { connection } = await manager.ensureActiveConnection()
        connection.ptyManager.requireKnown(ptyId)
        const result = await connection.rpc.request<Record<string, unknown>>("pty.input", {
          session_id: connection.remoteSessionID,
          pty_id: ptyId,
          data,
        })
        return textResult(`Sent input to PTY ${ptyId}`, { ptyId, ...result })
      }),
  )

  server.registerTool(
    "pty_read",
    {
      title: "Read Remote PTY",
      description: "Read buffered PTY output captured from REXD pty.output events.",
      inputSchema: {
        ptyId: z.string().min(1),
        maxBytes: z.number().int().positive().optional(),
        drain: z.boolean().optional(),
      },
    },
    async ({ ptyId, maxBytes, drain }) =>
      safeTool(async () => {
        const { connection } = await manager.ensureActiveConnection()
        const result = connection.ptyManager.read(ptyId, maxBytes ?? 65536, drain ?? true)
        return textResult(result.output || "(no buffered PTY output)", {
          ptyId,
          output: result.output,
          state: result.state,
        })
      }),
  )

  server.registerTool(
    "pty_resize",
    {
      title: "Resize Remote PTY",
      description: "Resize a remote PTY.",
      inputSchema: {
        ptyId: z.string().min(1),
        cols: z.number().int().positive(),
        rows: z.number().int().positive(),
      },
    },
    async ({ ptyId, cols, rows }) =>
      safeTool(async () => {
        const { connection } = await manager.ensureActiveConnection()
        connection.ptyManager.requireKnown(ptyId)
        const result = await connection.rpc.request<Record<string, unknown>>("pty.resize", {
          session_id: connection.remoteSessionID,
          pty_id: ptyId,
          cols,
          rows,
        })
        return textResult(`Resized PTY ${ptyId} to ${cols}x${rows}`, { ptyId, cols, rows, ...result })
      }),
  )

  server.registerTool(
    "pty_close",
    {
      title: "Close Remote PTY",
      description: "Close a remote PTY.",
      inputSchema: { ptyId: z.string().min(1) },
    },
    async ({ ptyId }) =>
      safeTool(async () => {
        const { connection } = await manager.ensureActiveConnection()
        connection.ptyManager.requireKnown(ptyId)
        const result = await connection.rpc.request<Record<string, unknown>>("pty.close", {
          session_id: connection.remoteSessionID,
          pty_id: ptyId,
        })
        connection.ptyManager.close(ptyId)
        return textResult(`Closed PTY ${ptyId}`, { ptyId, ...result })
      }),
  )

  server.registerTool(
    "pty_list",
    {
      title: "List Remote PTYs",
      description: "List known PTYs for the active REXD connection and their buffered output sizes/status.",
      inputSchema: {},
    },
    async () =>
      safeTool(async () => {
        const { connection } = await manager.ensureActiveConnection()
        const ptys = connection.ptyManager.list()
        return textResult(ptys.length ? formatJson({ ptys }) : "No known PTYs.", { ptys })
      }),
  )
}
