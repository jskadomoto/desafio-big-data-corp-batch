import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  CHECKPOINT_INTERVAL,
  processClubsFile,
  Summary,
} from '../application/process-clubs-file.ts'
import { AppError } from './app-error.ts'
import {
  Checkpoint,
  CHECKPOINT_VERSION,
  CheckpointStore,
  createCheckpointStore,
} from '../infrastructure/checkpoint-store.ts'
import { createCsvFileWriter, partialBytes } from '../infrastructure/csv-file-writer.ts'
import { CLUB_HEADERS, PLAYER_HEADERS } from '../domain/transform.ts'
import { linesFrom } from '../infrastructure/jsonl-file-source.ts'
import { TabularWriter } from '../application/ports.ts'

const USAGE =
  'uso: node dist/cli/index.js <entrada.jsonl> [diretorio-saida]\n' +
  '  entrada.jsonl    arquivo JSONL de clubes (obrigatório)\n' +
  '  diretorio-saida  onde gravar clubs.csv e players.csv (padrão: diretório atual)\n' +
  '\n' +
  'Se uma execução anterior sobre a mesma entrada tiver sido interrompida,\n' +
  'rodar o mesmo comando de novo retoma de onde parou.'

const EXIT_USAGE = 1
const EXIT_IO = 2

export const CHECKPOINT_FILE = '.desafio-batch-checkpoint.json'
export const CHECKPOINT_INTERVAL_ENV = 'DESAFIO_BATCH_CHECKPOINT_INTERVAL'

export const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const checkpointIntervalFrom = (env: NodeJS.ProcessEnv): number => {
  const raw = env[CHECKPOINT_INTERVAL_ENV]
  if (raw === undefined) return CHECKPOINT_INTERVAL
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError(
      EXIT_USAGE,
      `${CHECKPOINT_INTERVAL_ENV} precisa ser um inteiro positivo, recebi ${JSON.stringify(raw)}`,
    )
  }
  return parsed
}

export const formatReport = (summary: Summary, durationMs: number): string => {
  const rate = Math.round(summary.linesRead / (Math.max(durationMs, 1) / 1000))
  return [
    'resumo do processamento',
    `  linhas lidas:                        ${summary.linesRead}`,
    `  linhas em branco:                    ${summary.blankLines}`,
    `  linhas acima do limite:              ${summary.oversizedLines}`,
    `  json inválido:                       ${summary.invalidJson}`,
    `  registros inválidos (não é objeto):  ${summary.invalidRecords.not_an_object}`,
    `  registros inválidos (sem club_id):   ${summary.invalidRecords.missing_club_id}`,
    `  listas de jogadores malformadas:     ${summary.malformedPlayerLists}`,
    `  jogadores inválidos:                 ${summary.invalidPlayers}`,
    `  clubes filtrados (fora de A e B):    ${summary.filteredOutClubs}`,
    `  clubes escritos:                     ${summary.clubsWritten}`,
    `  jogadores escritos:                  ${summary.playersWritten}`,
    `  duração:                             ${durationMs} ms (${rate} linhas/s)`,
    '',
  ].join('\n')
}

export type Interruption = {
  readonly signal: NodeJS.Signals
  readonly exitCode: number
}

export type Shutdown = {
  readonly handle: (signal: NodeJS.Signals) => void
  readonly interruption: () => Interruption | undefined
}

export const createShutdown = (): Shutdown => {
  let interruption: Interruption | undefined
  return {
    interruption: () => interruption,
    handle: (signal: NodeJS.Signals): void => {
      interruption = { signal, exitCode: signal === 'SIGINT' ? 130 : 143 }
    },
  }
}

export const isUsable = (
  checkpoint: Checkpoint | null,
  inputSize: number,
  inputMtimeMs: number,
): checkpoint is Checkpoint =>
  checkpoint !== null &&
  checkpoint.inputSize === inputSize &&
  checkpoint.inputMtimeMs === inputMtimeMs

export const partialsMatch = (
  checkpoint: Checkpoint,
  clubs: number | null,
  players: number | null,
): boolean =>
  clubs !== null &&
  players !== null &&
  clubs >= checkpoint.outputs.clubs &&
  players >= checkpoint.outputs.players

const run = async (inputPath: string, outputDir: string): Promise<void> => {
  const startedAt = Date.now()
  const checkpointInterval = checkpointIntervalFrom(process.env)
  const input = await stat(inputPath)

  const store = createCheckpointStore(join(outputDir, CHECKPOINT_FILE))
  const clubsPath = join(outputDir, 'clubs.csv')
  const playersPath = join(outputDir, 'players.csv')

  const saved = await store.load()
  const matchesInput = isUsable(saved, input.size, input.mtimeMs)
  const resuming =
    matchesInput &&
    partialsMatch(saved, await partialBytes(clubsPath), await partialBytes(playersPath))

  if (resuming) {
    process.stderr.write(
      `retomando de checkpoint: ${saved.summary.linesRead} linhas já processadas, ` +
        `${saved.inputOffset} de ${input.size} bytes\n`,
    )
  } else if (matchesInput) {
    process.stderr.write(
      'checkpoint órfão: o parcial que ele aponta não está mais no disco, recomeçando do zero\n',
    )
    await store.clear()
  }

  const clubsWriter = await createCsvFileWriter(
    clubsPath,
    CLUB_HEADERS,
    resuming ? { resumeFromBytes: saved.outputs.clubs } : {},
  )
  const playersWriter = await createCsvFileWriter(
    playersPath,
    PLAYER_HEADERS,
    resuming ? { resumeFromBytes: saved.outputs.players } : {},
  )

  const shutdown = createShutdown()
  process.on('SIGINT', shutdown.handle)
  process.on('SIGTERM', shutdown.handle)

  try {
    const summary = await processClubsFile(
      linesFrom(inputPath, {
        startOffset: resuming ? saved.inputOffset : 0,
      }),
      clubsWriter,
      playersWriter,
      {
        resumeFrom: resuming ? saved.summary : undefined,
        checkpointInterval,
        shouldStop: () => shutdown.interruption() !== undefined,
        onProgress: (linesRead) => {
          process.stderr.write(`... ${linesRead} linhas lidas\n`)
        },
        onCheckpoint: async (inputOffset, partial) => {
          await saveCheckpoint(store, input, inputOffset, partial, clubsWriter, playersWriter)
        },
      },
    )

    const stop = shutdown.interruption()
    if (stop !== undefined) {
      throw new AppError(
        stop.exitCode,
        `interrompido por ${stop.signal}, progresso salvo, rode o mesmo comando para retomar`,
      )
    }

    await clubsWriter.close()
    await playersWriter.close()
    await store.clear()
    process.stderr.write(formatReport(summary, Date.now() - startedAt))
  } catch (error) {
    const recoverable = (await store.load()) !== null
    if (recoverable) {
      await clubsWriter.suspend()
      await playersWriter.suspend()
    } else {
      await clubsWriter.discard()
      await playersWriter.discard()
    }
    throw error
  } finally {
    process.off('SIGINT', shutdown.handle)
    process.off('SIGTERM', shutdown.handle)
  }
}

export const saveCheckpoint = async (
  store: CheckpointStore,
  input: { readonly size: number; readonly mtimeMs: number },
  inputOffset: number,
  summary: Summary,
  clubsWriter: TabularWriter,
  playersWriter: TabularWriter,
): Promise<void> => {
  const clubs = await clubsWriter.sync()
  const players = await playersWriter.sync()
  await store.save({
    version: CHECKPOINT_VERSION,
    inputSize: input.size,
    inputMtimeMs: input.mtimeMs,
    inputOffset,
    outputs: { clubs, players },
    summary,
  })
}

export const main = async (argv: readonly string[]): Promise<number> => {
  try {
    const inputPath = argv[0]
    if (inputPath === undefined || inputPath.length === 0) {
      throw new AppError(EXIT_USAGE, USAGE)
    }
    await run(inputPath, argv[1] ?? '.')
    return 0
  } catch (error) {
    const appError = error instanceof AppError ? error : new AppError(EXIT_IO, toMessage(error))
    process.stderr.write(`erro: ${appError.message}\n`)
    return appError.exitCode
  }
}
