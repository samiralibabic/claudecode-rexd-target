#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(__dirname, "..")
const projectRoot = resolve(process.argv[2] || process.env.CLAUDE_PROJECT_DIR || process.cwd())
const source = resolve(pluginRoot, "aliases/target.md")
const destination = resolve(projectRoot, ".claude/commands/target.md")

if (!existsSync(source)) {
  process.stderr.write(`Alias template not found: ${source}\n`)
  process.exit(1)
}

mkdirSync(dirname(destination), { recursive: true })
writeFileSync(destination, readFileSync(source, "utf8"))
process.stdout.write(`Installed /target alias at ${destination}\n`)
