import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { registerExecTools } from "./tools/exec"
import { registerFsTools } from "./tools/fs"
import { registerPtyTools } from "./tools/pty"
import { registerTargetTools } from "./tools/target"
import { CLIENT_VERSION } from "./version"

const server = new McpServer(
  { name: "rexd-target", version: CLIENT_VERSION },
  {
    instructions: [
      "Use these tools for remote filesystem, search, shell, and PTY work when a REXD target is active.",
      "Do not use local Claude Code filesystem, search, or Bash tools while a target is active.",
      "Select a target with target_use before remote operations.",
      "If local built-in tools are denied by the plugin hook, retry with the matching rexd-target MCP tool.",
    ].join("\n"),
  },
)

registerTargetTools(server)
registerFsTools(server)
registerExecTools(server)
registerPtyTools(server)

const transport = new StdioServerTransport()

try {
  await server.connect(transport)
} catch (err) {
  const message = err instanceof Error ? err.stack || err.message : String(err)
  process.stderr.write(`${message}\n`)
  process.exit(1)
}
