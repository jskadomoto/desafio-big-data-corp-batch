import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url))
const sample = join(fixtures, 'sample.jsonl')

let dir: string
let originalArgv: string[]
let originalCwd: string
let originalExitCode: typeof process.exitCode

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'desafio-batch-bootstrap-'))
  originalArgv = process.argv
  originalExitCode = process.exitCode
  originalCwd = process.cwd()
  process.chdir(dir)
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
})

afterEach(async () => {
  process.chdir(originalCwd)
  process.argv = originalArgv
  process.exitCode = originalExitCode
  vi.restoreAllMocks()
  vi.resetModules()
  await rm(dir, { recursive: true, force: true })
})

// O bootstrap roda no import, então cada caso precisa de um módulo novo.
const bootstrapWith = async (args: readonly string[]): Promise<void> => {
  vi.resetModules()
  process.argv = [process.execPath, join('dist', 'cli', 'index.js'), ...args]
  await import('../../cli/index.ts')
}

describe('bootstrap do CLI', () => {
  it('repassa os argumentos da linha de comando e publica os dois CSVs', async () => {
    await bootstrapWith([sample, dir])

    expect(process.exitCode).toBe(0)
    expect((await readdir(dir)).sort()).toEqual(['clubs.csv', 'players.csv'])
    expect(await readFile(join(dir, 'clubs.csv'), 'utf8')).toBe(
      await readFile(join(fixtures, 'expected-clubs.csv'), 'utf8'),
    )
    expect(await readFile(join(dir, 'players.csv'), 'utf8')).toBe(
      await readFile(join(fixtures, 'expected-players.csv'), 'utf8'),
    )
  })

  it('leva o código de saída do erro para process.exitCode, sem lançar', async () => {
    await bootstrapWith([])

    expect(process.exitCode).toBe(1)
  })

  it('descarta argv[0] e argv[1], que são o node e o próprio script', async () => {
    await bootstrapWith([join(dir, 'nao-existe.jsonl'), dir])

    expect(process.exitCode).toBe(2)
    expect(await readdir(dir)).toEqual([])
  })
})
