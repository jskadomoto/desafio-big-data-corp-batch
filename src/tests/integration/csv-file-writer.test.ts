import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCsvFileWriter, DEFAULT_FLUSH_BYTES } from '../../infrastructure/csv-file-writer.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'desafio-batch-writer-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const partialSize = async (path: string): Promise<number> => (await stat(`${path}.tmp`)).size

describe('createCsvFileWriter com teto de memória', () => {
  it('grava no disco assim que o buffer alcança flushBytes', async () => {
    const path = join(dir, 'clubs.csv')
    const writer = await createCsvFileWriter(path, ['a', 'b'], { flushBytes: 8 })

    expect(await partialSize(path)).toBe(0)

    await writer.writeRow(['1', '2'])

    expect(await partialSize(path)).toBe(8)
    expect(await readFile(`${path}.tmp`, 'utf8')).toBe('a,b\n1,2\n')

    await writer.close()

    expect(await readFile(path, 'utf8')).toBe('a,b\n1,2\n')
  })

  it('abaixo do teto o buffer não vai para o disco antes do fim', async () => {
    const path = join(dir, 'players.csv')
    const writer = await createCsvFileWriter(path, ['a', 'b'], { flushBytes: 1024 })

    await writer.writeRow(['1', '2'])

    expect(await partialSize(path)).toBe(0)

    await writer.close()

    expect(await readFile(path, 'utf8')).toBe('a,b\n1,2\n')
  })

  it('o padrão é 1 MiB, e não descarrega a cada linha', async () => {
    const path = join(dir, 'default.csv')
    const writer = await createCsvFileWriter(path, ['a', 'b'])

    await writer.writeRow(['1', '2'])

    expect(DEFAULT_FLUSH_BYTES).toBe(1024 * 1024)
    expect(await partialSize(path)).toBe(0)

    await writer.close()
  })

  it('mantém memória constante: o que fica pendente nunca passa do teto', async () => {
    const path = join(dir, 'muitas.csv')
    const flushBytes = 64
    const writer = await createCsvFileWriter(path, ['a', 'b'], { flushBytes })

    let written = 'a,b\n'.length
    for (let i = 0; i < 200; i += 1) {
      const row = `${i},linha\n`
      await writer.writeRow([String(i), 'linha'])
      written += row.length

      const pending = written - (await partialSize(path))
      expect(pending).toBeLessThan(flushBytes)
    }

    await writer.close()

    const lines = (await readFile(path, 'utf8')).split('\n')
    expect(lines[0]).toBe('a,b')
    expect(lines[200]).toBe('199,linha')
    expect(lines).toHaveLength(202)
  })
})
