export type McpTextResult = {
  content: Array<{ type: "text"; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

export function textResult(text: string, structuredContent?: Record<string, unknown>, isError = false): McpTextResult {
  return {
    content: [{ type: "text", text }],
    ...(structuredContent ? { structuredContent } : {}),
    ...(isError ? { isError: true } : {}),
  }
}

export function errorResult(err: unknown): McpTextResult {
  const message = err instanceof Error ? err.message : String(err)
  return textResult(message, { error: message }, true)
}

export async function safeTool(fn: () => Promise<McpTextResult> | McpTextResult): Promise<McpTextResult> {
  try {
    return await fn()
  } catch (err) {
    return errorResult(err)
  }
}

export function parseExpectedMtime(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined
  if (typeof value === "number") return value
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`expectedMtime must be a Unix millisecond timestamp, got: ${value}`)
  return parsed
}

export function requireCapability(capabilities: Record<string, boolean | undefined> | undefined, name: string): void {
  if (capabilities?.[name] === false) {
    throw new Error(`Active target has ${name} capability disabled`)
  }
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}
