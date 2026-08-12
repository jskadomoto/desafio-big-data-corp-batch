import { open, rename, rm, stat, type FileHandle } from 'node:fs/promises'
import type { TabularWriter } from '../application/ports.ts'

const NEEDS_QUOTES = /[",\n\r]/

export const DEFAULT_FLUSH_BYTES = 1024 * 1024

export const escapeCsvField = (field: string): string =>
  NEEDS_QUOTES.test(field) ? `"${field.replaceAll('"', '""')}"` : field

export const partialBytes = async (path: string): Promise<number | null> => {
  try {
    return (await stat(`${path}.tmp`)).size
  } catch {
    return null
  }
}

export type CsvWriterOptions = {
  readonly resumeFromBytes?: number
  readonly flushBytes?: number
}

export const createCsvFileWriter = async (
  path: string,
  headers: readonly string[],
  options: CsvWriterOptions = {},
): Promise<TabularWriter> => {
  const tmpPath = `${path}.tmp`
  const flushBytes = options.flushBytes ?? DEFAULT_FLUSH_BYTES
  const resumeFromBytes = options.resumeFromBytes

  let handle: FileHandle
  let bytes: number
  if (resumeFromBytes === undefined) {
    handle = await open(tmpPath, 'w')
    bytes = 0
  } else {
    handle = await open(tmpPath, 'r+')
    await handle.truncate(resumeFromBytes)
    bytes = resumeFromBytes
  }

  let pending = ''

  const flush = async (): Promise<void> => {
    if (pending.length === 0) return
    const data = Buffer.from(pending, 'utf8')
    pending = ''
    let written = 0
    while (written < data.length) {
      const { bytesWritten } = await handle.write(
        data,
        written,
        data.length - written,
        bytes + written,
      )
      written += bytesWritten
    }
    bytes += written
  }

  const writeRow = async (row: readonly string[]): Promise<void> => {
    pending += `${row.map(escapeCsvField).join(',')}\n`
    if (pending.length >= flushBytes) await flush()
  }

  if (resumeFromBytes === undefined) await writeRow(headers)

  return {
    writeRow,
    sync: async (): Promise<number> => {
      await flush()
      await handle.sync()
      return bytes
    },
    close: async (): Promise<void> => {
      await flush()
      await handle.sync()
      await handle.close()
      await rename(tmpPath, path)
    },
    suspend: async (): Promise<void> => {
      pending = ''
      await handle.close()
    },
    discard: async (): Promise<void> => {
      pending = ''
      await handle.close()
      await rm(tmpPath, { force: true })
    },
  }
}
