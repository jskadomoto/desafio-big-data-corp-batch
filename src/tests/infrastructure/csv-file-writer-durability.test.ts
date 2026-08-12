import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createCsvFileWriter } from '../../infrastructure/csv-file-writer.ts'

let dir: string
let fsync: MockInstance<() => Promise<void>>

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'desafio-batch-durabilidade-'))
  const probe = await open(join(dir, '.probe'), 'w')
  const fileHandle = Object.getPrototypeOf(probe) as { sync: () => Promise<void> }
  await probe.close()
  fsync = vi.spyOn(fileHandle, 'sync')
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(dir, { recursive: true, force: true })
})

describe('createCsvFileWriter: durabilidade', () => {
  it('sync() manda o fsync antes de devolver o tamanho que vai para o checkpoint', async () => {
    const path = join(dir, 'clubs.csv')
    const writer = await createCsvFileWriter(path, ['a', 'b'])

    await writer.writeRow(['1', '2'])
    const bytes = await writer.sync()

    expect(bytes).toBe('a,b\n1,2\n'.length)
    expect(fsync).toHaveBeenCalledTimes(1)

    await writer.close()
  })

  it('close() manda o fsync antes de promover o .tmp para o nome final', async () => {
    const path = join(dir, 'players.csv')
    const writer = await createCsvFileWriter(path, ['a', 'b'])

    await writer.writeRow(['1', '2'])
    await writer.close()

    expect(fsync).toHaveBeenCalledTimes(1)
    expect(await readFile(path, 'utf8')).toBe('a,b\n1,2\n')
  })
})

describe('createCsvFileWriter: retomada', () => {
  it('trunca o parcial no offset retomado e some com a cauda meio gravada', async () => {
    const path = join(dir, 'clubs.csv')
    const confirmado = 'a,b\n1,2\n'
    await writeFile(`${path}.tmp`, `${confirmado}cauda meio gravada que precisa sumir`, 'utf8')

    const writer = await createCsvFileWriter(path, ['a', 'b'], {
      resumeFromBytes: confirmado.length,
    })
    await writer.writeRow(['3', '4'])
    await writer.close()

    expect(await readFile(path, 'utf8')).toBe('a,b\n1,2\n3,4\n')
  })
})
