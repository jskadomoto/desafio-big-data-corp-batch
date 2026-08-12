import * as fsPromises from 'node:fs/promises'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHECKPOINT_VERSION,
  createCheckpointStore,
  type Checkpoint,
} from '../../infrastructure/checkpoint-store.ts'
import { emptySummary } from '../../application/process-clubs-file.ts'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    rename: vi.fn(actual.rename),
  }
})

let dir: string
let path: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'desafio-batch-checkpoint-'))
  path = join(dir, '.desafio-batch-checkpoint.json')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const checkpoint: Checkpoint = {
  version: CHECKPOINT_VERSION,
  inputSize: 4096,
  inputMtimeMs: 1_700_000_000_000,
  inputOffset: 2048,
  outputs: { clubs: 300, players: 700 },
  summary: { ...emptySummary(), linesRead: 42, clubsWritten: 40 },
}

describe('createCheckpointStore', () => {
  it('devolve o que gravou, com os contadores intactos', async () => {
    const store = createCheckpointStore(path)

    await store.save(checkpoint)

    expect(await store.load()).toEqual(checkpoint)
  })

  it('sem arquivo nenhum, load devolve null', async () => {
    expect(await createCheckpointStore(path).load()).toBeNull()
  })

  it('arquivo truncado no meio da gravação devolve null em vez de derrubar o programa', async () => {
    await writeFile(path, '{"version":1,"inputSize":4096,"inputOff', 'utf8')

    await expect(createCheckpointStore(path).load()).resolves.toBeNull()
  })

  it('arquivo com lixo que não é JSON devolve null', async () => {
    await writeFile(path, 'isso não é json\n', 'utf8')

    await expect(createCheckpointStore(path).load()).resolves.toBeNull()
  })

  it('arquivo vazio devolve null', async () => {
    await writeFile(path, '', 'utf8')

    await expect(createCheckpointStore(path).load()).resolves.toBeNull()
  })

  it('JSON válido de outra versão devolve null, sem retomar com formato errado', async () => {
    await writeFile(
      path,
      JSON.stringify({ ...checkpoint, version: CHECKPOINT_VERSION + 1 }),
      'utf8',
    )

    expect(await createCheckpointStore(path).load()).toBeNull()
  })

  it('JSON válido que não é objeto devolve null', async () => {
    await writeFile(path, '"apenas um texto"', 'utf8')

    expect(await createCheckpointStore(path).load()).toBeNull()
  })

  it('clear apaga o arquivo e não reclama se ele já não estiver lá', async () => {
    const store = createCheckpointStore(path)
    await store.save(checkpoint)

    await store.clear()
    await store.clear()

    expect(await store.load()).toBeNull()
  })

  it('não deixa o .tmp para trás depois de gravar', async () => {
    const store = createCheckpointStore(path)

    await store.save(checkpoint)

    await expect(readFile(`${path}.tmp`, 'utf8')).rejects.toThrow(/ENOENT/)
  })

  it('deve gravar o checkpoint de forma atômica usando .tmp', async () => {
    const renameSpy = vi.spyOn(fsPromises, 'rename')
    const store = createCheckpointStore(path)

    await store.save(checkpoint)

    expect(renameSpy).toHaveBeenCalledWith(`${path}.tmp`, path)

    renameSpy.mockRestore()
  })
})
