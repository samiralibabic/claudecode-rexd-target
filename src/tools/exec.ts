import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { connectionManager, type ConnectionManager } from "../connection-manager"
import { assertRemotePathAllowed, resolveRemotePath } from "../paths"
import { runRemoteCommand, startRemoteCommand, waitRemoteCommand } from "../remote-command"
import { requireCapability, safeTool, textResult } from "./common"

function renderExecResult(stdout: string, stderr: string, exitCode: number | null, status: string): string {
  const out = stdout.trimEnd()
  const err = stderr.trimEnd()
  const parts: string[] = []
  if (out) parts.push(out)
  if (err) parts.push(out ? `[stderr]\n${err}` : err)
  if (exitCode !== null && exitCode !== 0) parts.push(`[exit code: ${exitCode}]`)
  if (exitCode === null && status === "running") parts.push("[status: running]")
  return parts.length ? parts.join("\n") : "(no output)"
}

export function registerExecTools(server: McpServer, manager: ConnectionManager = connectionManager): void {
  server.registerTool(
    "exec",
    {
      title: "Remote Exec",
      description: "Run a shell command on the active REXD target and collect stdout/stderr/exit code.",
      inputSchema: {
        command: z.string().min(1),
        cwd: z.string().optional(),
        timeoutMs: z.number().int().positive().optional(),
        maxOutputBytes: z.number().int().positive().optional(),
        login: z.boolean().optional(),
      },
    },
    async ({ command, cwd, timeoutMs, maxOutputBytes, login }) =>
      safeTool(async () => {
        const { connection } = await manager.ensureActiveConnection()
        requireCapability(connection.target.capabilities, "shell")
        const remoteCwd = resolveRemotePath(connection.cwd, cwd, connection.target)
        assertRemotePathAllowed(connection.target, remoteCwd, connection.workspaceRoots)

        const result = await runRemoteCommand(connection, {
          command,
          cwd: remoteCwd,
          timeoutMs: timeoutMs ?? 120000,
          maxOutputBytes,
          login: login ?? connection.target.loginShell === true,
        })

        return textResult(renderExecResult(result.stdout, result.stderr, result.exitCode, result.status), {
          command,
          cwd: remoteCwd,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          signal: result.signal,
          timedOut: result.timedOut,
          durationMs: result.durationMs,
          status: result.status,
          stdoutTruncated: result.stdoutTruncated,
          stderrTruncated: result.stderrTruncated,
        })
      }),
  )

  server.registerTool(
    "exec_start",
    {
      title: "Remote Exec Start",
      description: "Start a long-running remote shell command on the active REXD target.",
      inputSchema: {
        command: z.string().min(1),
        cwd: z.string().optional(),
        timeoutMs: z.number().int().positive().optional(),
        maxOutputBytes: z.number().int().positive().optional(),
        login: z.boolean().optional(),
        detach: z.boolean().optional(),
      },
    },
    async ({ command, cwd, timeoutMs, maxOutputBytes, login, detach }) =>
      safeTool(async () => {
        const { connection } = await manager.ensureActiveConnection()
        requireCapability(connection.target.capabilities, "shell")
        const remoteCwd = resolveRemotePath(connection.cwd, cwd, connection.target)
        assertRemotePathAllowed(connection.target, remoteCwd, connection.workspaceRoots)
        const processId = await startRemoteCommand(connection, {
          command,
          cwd: remoteCwd,
          timeoutMs,
          maxOutputBytes,
          login: login ?? connection.target.loginShell === true,
          detach,
        })
        return textResult(`Started remote process ${processId}`, { processId, command, cwd: remoteCwd })
      }),
  )

  server.registerTool(
    "exec_wait",
    {
      title: "Remote Exec Wait",
      description: "Return buffered stdout/stderr and status for a remote process.",
      inputSchema: {
        processId: z.string().min(1),
        timeoutMs: z.number().int().nonnegative().optional(),
      },
    },
    async ({ processId, timeoutMs }) =>
      safeTool(async () => {
        const { connection } = await manager.ensureActiveConnection()
        const snapshot = await waitRemoteCommand(connection, processId, timeoutMs ?? 1000)
        const exitCode = typeof snapshot.exit?.exit_code === "number" ? snapshot.exit.exit_code : null
        return textResult(renderExecResult(snapshot.stdout, snapshot.stderr, exitCode, snapshot.status), {
          processId,
          stdout: snapshot.stdout,
          stderr: snapshot.stderr,
          exitCode,
          signal: snapshot.exit?.signal ?? null,
          timedOut: snapshot.exit?.timed_out === true,
          status: snapshot.status,
          stdoutTruncated: snapshot.stdoutTruncated,
          stderrTruncated: snapshot.stderrTruncated,
        })
      }),
  )

  server.registerTool(
    "exec_input",
    {
      title: "Remote Exec Input",
      description: "Send stdin to a running remote process.",
      inputSchema: {
        processId: z.string().min(1),
        data: z.string(),
        eof: z.boolean().optional(),
      },
    },
    async ({ processId, data, eof }) =>
      safeTool(async () => {
        const { connection } = await manager.ensureActiveConnection()
        const result = await connection.rpc.request<Record<string, unknown>>("exec.input", {
          session_id: connection.remoteSessionID,
          process_id: processId,
          data,
          eof: eof === true,
        })
        return textResult(`Sent input to ${processId}`, { processId, ...result })
      }),
  )

  server.registerTool(
    "exec_kill",
    {
      title: "Remote Exec Kill",
      description: "Kill a running remote process.",
      inputSchema: {
        processId: z.string().min(1),
        signal: z.string().optional(),
      },
    },
    async ({ processId, signal }) =>
      safeTool(async () => {
        const { connection } = await manager.ensureActiveConnection()
        const result = await connection.rpc.request<Record<string, unknown>>("exec.kill", {
          session_id: connection.remoteSessionID,
          process_id: processId,
          signal,
        })
        return textResult(`Killed remote process ${processId}`, { processId, ...result })
      }),
  )
}
