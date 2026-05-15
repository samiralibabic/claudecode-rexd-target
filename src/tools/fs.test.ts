import { describe, expect, test } from "bun:test"
import { buildReadFileRpcParams, DEFAULT_READ_FILE_MAX_BYTES } from "./fs"

describe("read_file safety", () => {
  test("utf8 reads use a bounded remote length by default", () => {
    const params = buildReadFileRpcParams({ sessionId: "s_1", path: "/srv/app/large.txt" })
    expect(params.encoding).toBe("utf8")
    expect(params.length).toBe(DEFAULT_READ_FILE_MAX_BYTES)
  })

  test("utf8 reads support explicit maxBytes", () => {
    const params = buildReadFileRpcParams({ sessionId: "s_1", path: "/srv/app/large.txt", maxBytes: 4096 })
    expect(params.length).toBe(4096)
  })
})
