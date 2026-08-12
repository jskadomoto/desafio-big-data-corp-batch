import { createReadStream } from 'node:fs'
import type { SourceLine } from '../application/ports.ts'

const NEW_LINE = 0x0a
const CARRIAGE_RETURN = 0x0d
const EMPTY = Buffer.alloc(0)

export const DEFAULT_MAX_LINE_BYTES = 64 * 1024 * 1024

export type LineSourceOptions = {
  readonly startOffset?: number
  readonly maxLineBytes?: number
}

const withoutCarriageReturn = (line: Buffer): Buffer =>
  line.length > 0 && line[line.length - 1] === CARRIAGE_RETURN ? line.subarray(0, -1) : line

const decode = (parts: readonly Buffer[], bytes: number, last: Buffer): string => {
  const whole = parts.length === 0 ? last : Buffer.concat([...parts, last], bytes + last.length)
  return withoutCarriageReturn(whole).toString('utf8')
}

const createAccumulator = (maxLineBytes: number) => {
  let parts: Buffer[] = []
  let bytes = 0
  let oversized = false

  const reset = (): void => {
    parts = []
    bytes = 0
    oversized = false
  }

  return {
    take: (last: Buffer, endOffset: number): SourceLine => {
      const line: SourceLine = oversized
        ? { text: '', endOffset, oversized: true }
        : { text: decode(parts, bytes, last), endOffset, oversized: false }
      reset()
      return line
    },
    hold: (rest: Buffer): void => {
      if (rest.length === 0 || oversized) return
      if (bytes + rest.length > maxLineBytes) {
        parts = []
        bytes = 0
        oversized = true
        return
      }
      parts.push(rest)
      bytes += rest.length
    },
    tail: (endOffset: number): SourceLine | null => {
      if (oversized) {
        reset()
        return { text: '', endOffset, oversized: true }
      }
      if (bytes === 0) return null
      const line: SourceLine = {
        text: decode(parts, bytes, EMPTY),
        endOffset,
        oversized: false,
      }
      reset()
      return line
    },
  }
}

export const linesFrom = async function* (
  path: string,
  options: LineSourceOptions = {},
): AsyncIterable<SourceLine> {
  const startOffset = options.startOffset ?? 0
  const lines = createAccumulator(options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES)
  const stream = createReadStream(path, { start: startOffset })
  let base = startOffset

  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      let start = 0
      for (;;) {
        const newline = chunk.indexOf(NEW_LINE, start)
        if (newline === -1) break
        yield lines.take(chunk.subarray(start, newline), base + newline + 1)
        start = newline + 1
      }
      lines.hold(chunk.subarray(start))
      base += chunk.length
    }

    const tail = lines.tail(base)
    if (tail !== null) yield tail
  } finally {
    stream.destroy()
  }
}
