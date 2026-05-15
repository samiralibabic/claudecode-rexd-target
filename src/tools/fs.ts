import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { createTwoFilesPatch } from "diff"
import { z } from "zod"
import { connectionManager, type ConnectionManager } from "../connection-manager"
import {
  assertRemotePathAllowed,
  formatLineNumbered,
  formatListEntries,
  guardPatchText,
  guardRemoteGlob,
  resolveRemotePath,
  shellQuote,
} from "../paths"
import { runRemoteCommand } from "../remote-command"
import type { Connection } from "../types"
import { formatJson, parseExpectedMtime, requireCapability, safeTool, textResult } from "./common"

type FsReadResult = {
  path?: string
  size?: number
  mtime?: number
  encoding?: string
  content?: string
  truncated?: boolean
}

function ensureFs(connection: Connection): void {
  requireCapability(connection.target.capabilities, "fs")
}

function ensureShell(connection: Connection): void {
  requireCapability(connection.target.capabilities, "shell")
}

async function readUtf8(connection: Connection, path: string): Promise<FsReadResult> {
  return await connection.rpc.request<FsReadResult>("fs.read", {
    session_id: connection.remoteSessionID,
    path,
    encoding: "utf8",
  })
}

export function registerFsTools(server: McpServer, manager: ConnectionManager = connectionManager): void {
  server.registerTool(
    "read_file",
    {
      title: "Read Remote File",
      description: "Read a file on the active REXD target. UTF-8 output is line-numbered by default.",
      inputSchema: {
        path: z.string().min(1),
        offset: z.number().int().positive().optional(),
        limit: z.number().int().positive().optional(),
        encoding: z.enum(["utf8", "base64"]).optional(),
      },
    },
    async ({ path, offset, limit, encoding }) =>
      safeTool(async () => {
        const { connection } = await manager.ensureActiveConnection()
        ensureFs(connection)
        const remotePath = resolveRemotePath(connection.cwd, path, connection.target)
        assertRemotePathAllowed(connection.target, remotePath, connection.workspaceRoots)

        const result = await connection.rpc.request<FsReadResult>("fs.read", {
          session_id: connection.remoteSessionID,
          path: remotePath,
          encoding: encoding ?? "utf8",
          ...(encoding === "base64" && offset ? { offset } : {}),
          ...(encoding === "base64" && limit ? { length: limit } : {}),
        })

        const content = String(result.content ?? "")
        if (encoding === "base64") {
          return textResult(content, { ...result, content, path: remotePath })
        }

        const text = formatLineNumbered(content, offset ?? 1, limit)
        return textResult(text, { ...result, content, lineNumberedContent: text, path: remotePath })
      }),
  )

  server.registerTool(
    "write_file",
    {
      title: "Write Remote File",
      description: "Create, replace, or append to a file on the active REXD target.",
      inputSchema: {
        path: z.string().min(1),
        content: z.string(),
        encoding: z.enum(["utf8", "base64"]).optional(),
        mode: z.enum(["create", "replace", "append"]).optional(),
        mkdirParents: z.boolean().optional(),
        atomic: z.boolean().optional(),
        expectedMtime: z.union([z.string(), z.number()]).optional(),
      },
    },
    async ({ path, content, encoding, mode, mkdirParents, atomic, expectedMtime }) =>
      safeTool(async () => {
        const { connection } = await manager.ensureActiveConnection()
        ensureFs(connection)
        const remotePath = resolveRemotePath(connection.cwd, path, connection.target)
        assertRemotePathAllowed(connection.target, remotePath, connection.workspaceRoots)

        const result = await connection.rpc.request<Record<string, unknown>>("fs.write", {
          session_id: connection.remoteSessionID,
          path: remotePath,
          content,
          encoding: encoding ?? "utf8",
          mode: mode ?? "replace",
          mkdir_parents: mkdirParents ?? true,
          atomic: atomic ?? true,
          expected_mtime: parseExpectedMtime(expectedMtime),
        })
        return textResult(`Wrote ${remotePath}\n${formatJson(result)}`, { ...result, path: remotePath })
      }),
  )

  server.registerTool(
    "list_dir",
    {
      title: "List Remote Directory",
      description: "List directory entries on the active REXD target.",
      inputSchema: {
        path: z.string().optional(),
        recursive: z.boolean().optional(),
        maxEntries: z.number().int().positive().optional(),
      },
    },
    async ({ path, recursive, maxEntries }) =>
      safeTool(async () => {
        const { connection } = await manager.ensureActiveConnection()
        ensureFs(connection)
        const remotePath = resolveRemotePath(connection.cwd, path, connection.target)
        assertRemotePathAllowed(connection.target, remotePath, connection.workspaceRoots)

        const result = await connection.rpc.request<{ path?: string; entries?: Array<Record<string, unknown>> }>("fs.list", {
          session_id: connection.remoteSessionID,
          path: remotePath,
          recursive: recursive === true,
          max_entries: maxEntries,
        })
        const entries = (result.entries ?? []) as Array<{ name?: string; type?: string; path?: string }>
        return textResult(formatListEntries(entries), { path: result.path ?? remotePath, entries })
      }),
  )

  server.registerTool(
    "glob",
    {
      title: "Remote Glob",
      description: "Find remote files using REXD fs.glob on the active target.",
      inputSchema: {
        pattern: z.string().min(1),
        cwd: z.string().optional(),
        maxMatches: z.number().int().positive().optional(),
      },
    },
    async ({ pattern, cwd, maxMatches }) =>
      safeTool(async () => {
        const { connection } = await manager.ensureActiveConnection()
        ensureFs(connection)
        if (pattern.startsWith("~")) throw new Error("Glob patterns beginning with '~' are not supported in v0.1.")
        const remoteCwd = resolveRemotePath(connection.cwd, cwd, connection.target)
        guardRemoteGlob(connection.target, remoteCwd, pattern, connection.workspaceRoots)

        const result = await connection.rpc.request<{ matches?: string[] }>("fs.glob", {
          session_id: connection.remoteSessionID,
          pattern,
          cwd: remoteCwd,
          max_matches: maxMatches,
        })
        const matches = result.matches ?? []
        return textResult(matches.length ? matches.join("\n") : "(no matches)", { matches, cwd: remoteCwd, pattern })
      }),
  )

  server.registerTool(
    "stat",
    {
      title: "Remote Stat",
      description: "Stat a path on the active REXD target.",
      inputSchema: { path: z.string().min(1) },
    },
    async ({ path }) =>
      safeTool(async () => {
        const { connection } = await manager.ensureActiveConnection()
        ensureFs(connection)
        const remotePath = resolveRemotePath(connection.cwd, path, connection.target)
        assertRemotePathAllowed(connection.target, remotePath, connection.workspaceRoots)

        const result = await connection.rpc.request<Record<string, unknown>>("fs.stat", {
          session_id: connection.remoteSessionID,
          path: remotePath,
        })
        return textResult(formatJson(result), { ...result, path: remotePath })
      }),
  )

  server.registerTool(
    "grep",
    {
      title: "Remote Grep",
      description: "Run remote ripgrep on the active REXD target. This never uses local grep.",
      inputSchema: {
        pattern: z.string().min(1),
        path: z.string().optional(),
        include: z.string().optional(),
        fixedStrings: z.boolean().optional(),
        caseInsensitive: z.boolean().optional(),
        maxCount: z.number().int().positive().optional(),
      },
    },
    async ({ pattern, path, include, fixedStrings, caseInsensitive, maxCount }) =>
      safeTool(async () => {
        const { connection } = await manager.ensureActiveConnection()
        ensureShell(connection)
        const cwd = connection.cwd
        assertRemotePathAllowed(connection.target, cwd, connection.workspaceRoots)
        const searchPath = path ? resolveRemotePath(cwd, path, connection.target) : "."
        if (path) assertRemotePathAllowed(connection.target, searchPath, connection.workspaceRoots)

        const args = ["rg", "-n", "--color=never"]
        if (fixedStrings) args.push("-F")
        if (caseInsensitive) args.push("-i")
        if (maxCount) args.push("-m", String(maxCount))
        if (include) args.push("-g", shellQuote(include))
        args.push("--", shellQuote(pattern), shellQuote(searchPath))

        const command = args.join(" ")
        const result = await runRemoteCommand(connection, {
          command,
          cwd,
          timeoutMs: 120000,
          maxOutputBytes: 2 * 1024 * 1024,
          login: connection.target.loginShell === true,
        })
        const text = result.stdout.trimEnd() || (result.exitCode === 1 ? "(no matches)" : result.stderr.trimEnd()) || "(no output)"
        return textResult(text, {
          command,
          cwd,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          noMatches: result.exitCode === 1,
          stdoutTruncated: result.stdoutTruncated,
          stderrTruncated: result.stderrTruncated,
        }, result.exitCode !== 0 && result.exitCode !== 1)
      }),
  )

  server.registerTool(
    "edit_file",
    {
      title: "Edit Remote File",
      description: "Apply an exact string replacement through REXD fs.edit on the active target.",
      inputSchema: {
        path: z.string().min(1),
        oldString: z.string(),
        newString: z.string(),
        replaceAll: z.boolean().optional(),
        expectedMtime: z.union([z.string(), z.number()]).optional(),
      },
    },
    async ({ path, oldString, newString, replaceAll, expectedMtime }) =>
      safeTool(async () => {
        const { connection } = await manager.ensureActiveConnection()
        ensureFs(connection)
        const remotePath = resolveRemotePath(connection.cwd, path, connection.target)
        assertRemotePathAllowed(connection.target, remotePath, connection.workspaceRoots)

        let before = ""
        try {
          before = String((await readUtf8(connection, remotePath)).content ?? "")
        } catch {
          before = ""
        }

        const result = await connection.rpc.request<Record<string, unknown>>("fs.edit", {
          session_id: connection.remoteSessionID,
          path: remotePath,
          old_string: oldString,
          new_string: newString,
          replace_all: replaceAll === true,
          expected_mtime: parseExpectedMtime(expectedMtime),
        })

        const after = String((await readUtf8(connection, remotePath)).content ?? "")
        const diff = createTwoFilesPatch(remotePath, remotePath, before, after, "before", "after")
        return textResult(`${diff}\n${formatJson(result)}`, { ...result, path: remotePath, diff })
      }),
  )

  server.registerTool(
    "apply_patch",
    {
      title: "Apply Remote Patch",
      description: "Apply an OpenAI-style patch through REXD fs.patch on the active target.",
      inputSchema: {
        patchText: z.string().min(1),
        cwd: z.string().optional(),
      },
    },
    async ({ patchText, cwd }) =>
      safeTool(async () => {
        const { connection } = await manager.ensureActiveConnection()
        ensureFs(connection)
        const remoteCwd = resolveRemotePath(connection.cwd, cwd, connection.target)
        assertRemotePathAllowed(connection.target, remoteCwd, connection.workspaceRoots)
        guardPatchText(connection.target, remoteCwd, patchText, connection.workspaceRoots)

        const result = await connection.rpc.request<Record<string, unknown>>("fs.patch", {
          session_id: connection.remoteSessionID,
          patch_text: patchText,
          cwd: remoteCwd,
        })
        return textResult(`Applied patch in ${remoteCwd}\n${formatJson(result)}`, { ...result, cwd: remoteCwd })
      }),
  )
}
