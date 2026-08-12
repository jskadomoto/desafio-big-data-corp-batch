import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from '../../cli/main.ts'

const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url))
const sample = join(fixtures, 'sample.jsonl')

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'desafio-batch-encoding-'))
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(dir, { recursive: true, force: true })
})

const outputBytes = async (name: string): Promise<Buffer> => {
  expect(await main([sample, dir])).toBe(0)
  return readFile(join(dir, name))
}

describe('encoding dos CSVs entregues', () => {
  it('grava acentuação como UTF-8, não como latin1', async () => {
    const bytes = await outputBytes('clubs.csv')

    expect(bytes.includes(Buffer.from([0xc3, 0xa3]))).toBe(true)
    expect(bytes.includes(0xe3)).toBe(false)
    expect(bytes.includes(Buffer.from('Neo Química Arena', 'utf8'))).toBe(true)
  })

  it('escreve o cabeçalho acentuado byte a byte como o enunciado pede', async () => {
    const bytes = await outputBytes('clubs.csv')

    expect(bytes.subarray(0, 128).includes(Buffer.from('Data de Fundação', 'utf8'))).toBe(true)
    expect(bytes.subarray(0, 128).includes(Buffer.from('País', 'utf8'))).toBe(true)
  })

  it('não escreve BOM: o arquivo começa direto no cabeçalho', async () => {
    const bytes = await outputBytes('clubs.csv')

    expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false)
    expect(bytes.subarray(0, 11).toString('utf8')).toBe('Id do Clube')
  })

  it('usa \\n como terminador, nunca \\r\\n, inclusive na última linha', async () => {
    const bytes = await outputBytes('players.csv')

    expect(bytes.includes(0x0d)).toBe(false)
    expect(bytes[bytes.length - 1]).toBe(0x0a)
  })

  it('preserva a quebra de linha dentro do campo, entre aspas', async () => {
    const bytes = await outputBytes('clubs.csv')

    expect(bytes.includes(Buffer.from('"quebra\nde linha"', 'utf8'))).toBe(true)
  })
})
