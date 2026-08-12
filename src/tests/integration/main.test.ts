import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHECKPOINT_FILE, main } from '../../cli/main.ts'
import { PROGRESS_INTERVAL } from '../../application/process-clubs-file.ts'
import { Checkpoint, createCheckpointStore } from '../../infrastructure/checkpoint-store.ts'

const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url))
const sample = join(fixtures, 'sample.jsonl')

let dir: string
let stderr: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'desafio-batch-main-'))
  stderr = ''
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array): boolean => {
    stderr += chunk.toString()
    return true
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(dir, { recursive: true, force: true })
})

const clubJson = (id: string): string =>
  `${JSON.stringify({
    club_id: id,
    name: `Clube ${id}`,
    championship: 'SERIE B',
    players: [{ player_id: `${id}-1`, name: 'Fulano' }],
  })}\n`

const inputWith = async (total: number): Promise<string> => {
  const path = join(dir, 'entrada.jsonl')
  await writeFile(path, Array.from({ length: total }, (_, i) => clubJson(`C${i}`)).join(''), 'utf8')
  return path
}

const listOutputs = async (outputDir: string): Promise<string[]> =>
  (await readdir(outputDir)).sort()

const writePartials = async (outputDir: string): Promise<void> => {
  const padding = 'x'.repeat(4096)
  await writeFile(join(outputDir, 'clubs.csv.tmp'), padding, 'utf8')
  await writeFile(join(outputDir, 'players.csv.tmp'), padding, 'utf8')
}

describe('main', () => {
  it('processa a fixture e gera os dois CSVs iguais aos esperados', async () => {
    const code = await main([sample, dir])

    expect(code).toBe(0)
    expect(await readFile(join(dir, 'clubs.csv'), 'utf8')).toBe(
      await readFile(join(fixtures, 'expected-clubs.csv'), 'utf8'),
    )
    expect(await readFile(join(dir, 'players.csv'), 'utf8')).toBe(
      await readFile(join(fixtures, 'expected-players.csv'), 'utf8'),
    )
    expect(await listOutputs(dir)).toEqual(['clubs.csv', 'players.csv'])
  })

  it('imprime o relatório com os contadores da fixture no stderr', async () => {
    await main([sample, dir])

    expect(stderr).toContain('linhas lidas:                        11')
    expect(stderr).toContain('linhas em branco:                    1')
    expect(stderr).toContain('linhas acima do limite:              0')
    expect(stderr).toContain('json inválido:                       1')
    expect(stderr).toContain('registros inválidos (não é objeto):  1')
    expect(stderr).toContain('registros inválidos (sem club_id):   1')
    expect(stderr).toContain('listas de jogadores malformadas:     1')
    expect(stderr).toContain('jogadores inválidos:                 1')
    expect(stderr).toContain('clubes filtrados (fora de A e B):    2')
    expect(stderr).toContain('clubes escritos:                     5')
    expect(stderr).toContain('jogadores escritos:                  3')
  })

  it('não deixa checkpoint para trás quando termina bem', async () => {
    await main([sample, dir])

    expect(await listOutputs(dir)).toEqual(['clubs.csv', 'players.csv'])
  })

  it('grava no diretório atual quando o segundo argumento é omitido', async () => {
    const previousCwd = process.cwd()
    process.chdir(dir)
    try {
      expect(await main([sample])).toBe(0)
    } finally {
      process.chdir(previousCwd)
    }

    expect(await listOutputs(dir)).toEqual(['clubs.csv', 'players.csv'])
  })

  it('reexecutar sobre a mesma saída é idempotente', async () => {
    await main([sample, dir])
    const firstRun = await readFile(join(dir, 'clubs.csv'), 'utf8')

    expect(await main([sample, dir])).toBe(0)
    expect(await readFile(join(dir, 'clubs.csv'), 'utf8')).toBe(firstRun)
    expect(await listOutputs(dir)).toEqual(['clubs.csv', 'players.csv'])
  })

  it('sem argumento de entrada devolve 1 e explica o uso', async () => {
    expect(await main([])).toBe(1)
    expect(stderr).toContain('uso:')
    expect(stderr).toContain('entrada.jsonl')
  })

  it('argumento de entrada vazio também é uso incorreto', async () => {
    expect(await main([''])).toBe(1)
    expect(stderr).toContain('uso:')
  })

  it('arquivo de entrada inexistente devolve 2 sem abrir saída nenhuma', async () => {
    expect(await main([join(dir, 'nao-existe.jsonl'), dir])).toBe(2)

    expect(stderr).toContain('erro:')
    expect(stderr).toContain('ENOENT')
    expect(await readdir(dir)).toEqual([])
  })

  it('diretório de saída inexistente devolve 2', async () => {
    expect(await main([sample, join(dir, 'sem-tal-pasta')])).toBe(2)

    expect(stderr).toContain('erro:')
    expect(stderr).toContain('ENOENT')
    expect(await readdir(dir)).toEqual([])
  })

  it('entrada que é diretório falha limpando os parciais, já que não há o que retomar', async () => {
    const outDir = join(dir, 'saida')
    await mkdir(outDir)

    expect(await main([dir, outDir])).toBe(2)

    expect(stderr).toContain('erro:')
    expect(await readdir(outDir)).toEqual([])
  })

  it('reporta progresso a cada intervalo de linhas lidas', async () => {
    const inputFile = join(dir, 'grande.jsonl')
    const outDir = join(dir, 'saida')
    await mkdir(outDir)
    await writeFile(
      inputFile,
      '\n'.repeat(PROGRESS_INTERVAL) + '{"club_id":"CRB","championship":"SERIE B"}\n',
      'utf8',
    )

    expect(await main([inputFile, outDir])).toBe(0)
    expect(stderr).toContain(`... ${PROGRESS_INTERVAL} linhas lidas`)
    expect(stderr).toContain(`linhas lidas:                        ${PROGRESS_INTERVAL + 1}`)
  })
})

describe('main interrompido por sinal', () => {
  it('SIGINT para no meio, salva progresso e devolve 130', async () => {
    const inputFile = await inputWith(20_000)
    const outDir = join(dir, 'saida')
    await mkdir(outDir)

    const listenersBefore = process.listenerCount('SIGINT')
    const running = main([inputFile, outDir])
    while (process.listenerCount('SIGINT') === listenersBefore) {
      await new Promise((resolve) => setImmediate(resolve))
    }
    process.emit('SIGINT', 'SIGINT')

    expect(await running).toBe(130)
    expect(stderr).toContain('interrompido por SIGINT')
    expect(stderr).toContain('rode o mesmo comando para retomar')
    expect(stderr).not.toContain('resumo do processamento')
    expect(await listOutputs(outDir)).toEqual([CHECKPOINT_FILE, 'clubs.csv.tmp', 'players.csv.tmp'])
    expect(process.listenerCount('SIGINT')).toBe(listenersBefore)
  })

  it('SIGTERM devolve 143', async () => {
    const inputFile = await inputWith(20_000)
    const outDir = join(dir, 'saida')
    await mkdir(outDir)

    const listenersBefore = process.listenerCount('SIGTERM')
    const running = main([inputFile, outDir])
    while (process.listenerCount('SIGTERM') === listenersBefore) {
      await new Promise((resolve) => setImmediate(resolve))
    }
    process.emit('SIGTERM', 'SIGTERM')

    expect(await running).toBe(143)
    expect(stderr).toContain('interrompido por SIGTERM')
  })

  it('retomar depois da interrupção produz a mesma saída de uma execução direta', async () => {
    const inputFile = await inputWith(20_000)
    const interruptedDir = join(dir, 'interrompido')
    const directDir = join(dir, 'direto')
    await mkdir(interruptedDir)
    await mkdir(directDir)

    expect(await main([inputFile, directDir])).toBe(0)

    const listenersBefore = process.listenerCount('SIGINT')
    const running = main([inputFile, interruptedDir])
    while (process.listenerCount('SIGINT') === listenersBefore) {
      await new Promise((resolve) => setImmediate(resolve))
    }
    process.emit('SIGINT', 'SIGINT')
    expect(await running).toBe(130)

    stderr = ''
    expect(await main([inputFile, interruptedDir])).toBe(0)

    expect(stderr).toContain('retomando de checkpoint')
    expect(await readFile(join(interruptedDir, 'clubs.csv'), 'utf8')).toBe(
      await readFile(join(directDir, 'clubs.csv'), 'utf8'),
    )
    expect(await readFile(join(interruptedDir, 'players.csv'), 'utf8')).toBe(
      await readFile(join(directDir, 'players.csv'), 'utf8'),
    )
    expect(await listOutputs(interruptedDir)).toEqual(['clubs.csv', 'players.csv'])
  })
})

describe('main retomando de checkpoint', () => {
  it('ignora e recomeça quando a entrada mudou de tamanho desde o checkpoint', async () => {
    const inputFile = await inputWith(10)
    const outDir = join(dir, 'saida')
    await mkdir(outDir)
    await writePartials(outDir)
    const store = createCheckpointStore(join(outDir, CHECKPOINT_FILE))
    const staleCheckpoint: Checkpoint = {
      version: 1,
      inputSize: 999_999,
      inputMtimeMs: 1,
      inputOffset: 500,
      outputs: { clubs: 10, players: 10 },
      summary: {
        linesRead: 5,
        blankLines: 0,
        oversizedLines: 0,
        malformedPlayerLists: 0,
        invalidJson: 0,
        invalidRecords: {
          not_an_object: 0,
          missing_club_id: 0,
        },
        invalidPlayers: 0,
        filteredOutClubs: 0,
        clubsWritten: 5,
        playersWritten: 5,
      },
    }
    await store.save(staleCheckpoint)

    expect(await main([inputFile, outDir])).toBe(0)

    expect(stderr).not.toContain('retomando de checkpoint')
    expect(stderr).toContain('clubes escritos:                     10')
    expect(await listOutputs(outDir)).toEqual(['clubs.csv', 'players.csv'])
  })

  it('recomeça quando a entrada foi regravada mantendo o tamanho', async () => {
    const inputFile = await inputWith(10)
    const outDir = join(dir, 'saida')
    await mkdir(outDir)
    await writePartials(outDir)
    const info = await stat(inputFile)
    await createCheckpointStore(join(outDir, CHECKPOINT_FILE)).save({
      version: 1,
      inputSize: info.size,
      inputMtimeMs: info.mtimeMs - 10_000,
      inputOffset: 100,
      outputs: { clubs: 10, players: 10 },
      summary: {
        linesRead: 3,
        blankLines: 0,
        oversizedLines: 0,
        malformedPlayerLists: 0,
        invalidJson: 0,
        invalidRecords: {
          not_an_object: 0,
          missing_club_id: 0,
        },
        invalidPlayers: 0,
        filteredOutClubs: 0,
        clubsWritten: 3,
        playersWritten: 3,
      },
    })

    expect(await main([inputFile, outDir])).toBe(0)

    expect(stderr).not.toContain('retomando de checkpoint')
    expect(stderr).toContain('clubes escritos:                     10')
  })

  it('tocar a entrada depois do checkpoint invalida a retomada', async () => {
    const inputFile = await inputWith(10)
    const outDir = join(dir, 'saida')
    await mkdir(outDir)
    await writePartials(outDir)
    const info = await stat(inputFile)
    await createCheckpointStore(join(outDir, CHECKPOINT_FILE)).save({
      version: 1,
      inputSize: info.size,
      inputMtimeMs: info.mtimeMs,
      inputOffset: 0,
      outputs: { clubs: 12, players: 17 },
      summary: {
        linesRead: 0,
        blankLines: 0,
        oversizedLines: 0,
        malformedPlayerLists: 0,
        invalidJson: 0,
        invalidRecords: {
          not_an_object: 0,
          missing_club_id: 0,
        },
        invalidPlayers: 0,
        filteredOutClubs: 0,
        clubsWritten: 0,
        playersWritten: 0,
      },
    })
    const future = new Date(info.mtimeMs + 60_000)
    await utimes(inputFile, future, future)

    expect(await main([inputFile, outDir])).toBe(0)

    expect(stderr).not.toContain('retomando de checkpoint')
  })
})

describe('main com checkpoint órfão', () => {
  const orphanCheckpoint = async (
    outDir: string,
    inputFile: string,
    outputs: { clubs: number; players: number },
  ): Promise<void> => {
    const info = await stat(inputFile)
    await createCheckpointStore(join(outDir, CHECKPOINT_FILE)).save({
      version: 1,
      inputSize: info.size,
      inputMtimeMs: info.mtimeMs,
      inputOffset: 100,
      outputs,
      summary: {
        linesRead: 3,
        blankLines: 0,
        oversizedLines: 0,
        malformedPlayerLists: 0,
        invalidJson: 0,
        invalidRecords: { not_an_object: 0, missing_club_id: 0 },
        invalidPlayers: 0,
        filteredOutClubs: 0,
        clubsWritten: 3,
        playersWritten: 3,
      },
    })
  }

  it('recomeça do zero quando o parcial que o checkpoint promete não existe', async () => {
    const inputFile = await inputWith(10)
    const outDir = join(dir, 'saida')
    await mkdir(outDir)
    await orphanCheckpoint(outDir, inputFile, { clubs: 50, players: 50 })

    expect(await main([inputFile, outDir])).toBe(0)

    expect(stderr).toContain('checkpoint órfão')
    expect(stderr).not.toContain('retomando de checkpoint')
    expect(stderr).toContain('clubes escritos:                     10')
    expect(await listOutputs(outDir)).toEqual(['clubs.csv', 'players.csv'])
  })

  it('destrava o estado exato de uma queda entre os dois renames', async () => {
    const inputFile = await inputWith(10)
    const referenceDir = join(dir, 'referencia')
    await mkdir(referenceDir)
    expect(await main([inputFile, referenceDir])).toBe(0)

    const outDir = join(dir, 'saida')
    await mkdir(outDir)
    await writeFile(join(outDir, 'clubs.csv'), 'publicado pela metade\n', 'utf8')
    await writeFile(join(outDir, 'players.csv.tmp'), 'parcial\n', 'utf8')
    await orphanCheckpoint(outDir, inputFile, { clubs: 50, players: 8 })

    expect(await main([inputFile, outDir])).toBe(0)

    expect(await listOutputs(outDir)).toEqual(['clubs.csv', 'players.csv'])
    expect(await readFile(join(outDir, 'clubs.csv'), 'utf8')).toBe(
      await readFile(join(referenceDir, 'clubs.csv'), 'utf8'),
    )
    expect(await readFile(join(outDir, 'players.csv'), 'utf8')).toBe(
      await readFile(join(referenceDir, 'players.csv'), 'utf8'),
    )
  })

  it('recomeça quando o parcial tem menos bytes do que o checkpoint promete', async () => {
    const inputFile = await inputWith(10)
    const outDir = join(dir, 'saida')
    await mkdir(outDir)
    await writeFile(join(outDir, 'clubs.csv.tmp'), 'curto\n', 'utf8')
    await writeFile(join(outDir, 'players.csv.tmp'), 'curto\n', 'utf8')
    await orphanCheckpoint(outDir, inputFile, { clubs: 5000, players: 5000 })

    expect(await main([inputFile, outDir])).toBe(0)

    expect(stderr).toContain('checkpoint órfão')
    expect(stderr).toContain('clubes escritos:                     10')
    expect(await listOutputs(outDir)).toEqual(['clubs.csv', 'players.csv'])
  })
})
