import { open, readFile, rename, rm } from 'node:fs/promises'
import type { Summary } from '../application/process-clubs-file.ts'

export const CHECKPOINT_VERSION = 1

export type Checkpoint = {
  readonly version: number
  readonly inputSize: number
  readonly inputMtimeMs: number
  readonly inputOffset: number
  readonly outputs: { readonly clubs: number; readonly players: number }
  readonly summary: Summary
}

export interface CheckpointStore {
  load(): Promise<Checkpoint | null>
  save(checkpoint: Checkpoint): Promise<void>
  clear(): Promise<void>
}

const isCheckpoint = (value: unknown): value is Checkpoint =>
  typeof value === 'object' &&
  value !== null &&
  (value as { version?: unknown }).version === CHECKPOINT_VERSION

export const createCheckpointStore = (path: string): CheckpointStore => ({
  load: async (): Promise<Checkpoint | null> => {
    let raw: string
    try {
      raw = await readFile(path, 'utf8')
    } catch {
      return null
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      return isCheckpoint(parsed) ? parsed : null
    } catch {
      return null
    }
  },

  save: async (checkpoint: Checkpoint): Promise<void> => {
    const tmpPath = `${path}.tmp`
    const data = Buffer.from(JSON.stringify(checkpoint), 'utf8')
    const handle = await open(tmpPath, 'w')
    try {
      let written = 0
      while (written < data.length) {
        const { bytesWritten } = await handle.write(data, written, data.length - written, written)
        written += bytesWritten
      }
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(tmpPath, path)
  },

  clear: async (): Promise<void> => {
    await rm(path, { force: true })
  },
})
