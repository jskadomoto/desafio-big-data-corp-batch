import { describe, expect, it, vi } from 'vitest'
import { SourceLine, TabularWriter } from '../../application/ports.ts'
import {
  CHECKPOINT_INTERVAL,
  emptySummary,
  processClubsFile,
  PROGRESS_INTERVAL,
  Summary,
} from '../../application/process-clubs-file.ts'

type FakeWriter = TabularWriter & {
  readonly rows: string[][]
  readonly calls: string[]
}

const fakeWriter = (): FakeWriter => {
  const rows: string[][] = []
  const calls: string[] = []
  return {
    rows,
    calls,
    writeRow: async (row: readonly string[]): Promise<void> => {
      rows.push([...row])
    },
    sync: async (): Promise<number> => {
      calls.push('sync')
      return rows.length
    },
    close: async (): Promise<void> => {
      calls.push('close')
    },
    suspend: async (): Promise<void> => {
      calls.push('suspend')
    },
    discard: async (): Promise<void> => {
      calls.push('discard')
    },
  }
}

const from = async function* (texts: readonly string[]): AsyncIterable<SourceLine> {
  let offset = 0
  for (const text of texts) {
    offset += Buffer.byteLength(text, 'utf8') + 1
    yield { text, endOffset: offset, oversized: false }
  }
}

const repeat = async function* (text: string, total: number): AsyncIterable<SourceLine> {
  for (let i = 0; i < total; i += 1) {
    yield { text, endOffset: (i + 1) * (text.length + 1), oversized: false }
  }
}

const run = async (
  texts: readonly string[],
): Promise<{
  summary: Summary
  clubs: FakeWriter
  players: FakeWriter
}> => {
  const clubs = fakeWriter()
  const players = fakeWriter()
  const summary = await processClubsFile(from(texts), clubs, players)
  return { summary, clubs, players }
}

const jsonl = (value: unknown): string => JSON.stringify(value)

describe('processClubsFile', () => {
  it('escreve clube e jogadores de um registro válido', async () => {
    const { summary, clubs, players } = await run([
      jsonl({
        club_id: 'SCCP',
        name: 'Sport Club Corinthians Paulista',
        championship: 'SERIE A',
        founding_date: '1910-09-01',
        colors: ['preto', 'branco'],
        players: [
          { player_id: 'SCCP-10', name: 'Rodrigo Garro', age: 26 },
          { player_id: 'SCCP-9', name: 'Yuri Alberto', goals: 15 },
        ],
      }),
    ])

    expect(summary.linesRead).toBe(1)
    expect(summary.clubsWritten).toBe(1)
    expect(summary.playersWritten).toBe(2)
    expect(clubs.rows).toEqual([
      [
        'SCCP',
        'Sport Club Corinthians Paulista',
        'SERIE A',
        '1910-09-01',
        '',
        '',
        '',
        '',
        '',
        '',
        'preto|branco',
      ],
    ])
    expect(players.rows).toEqual([
      ['SCCP', 'SCCP-10', 'Rodrigo Garro', '26', '', '', '', ''],
      ['SCCP', 'SCCP-9', 'Yuri Alberto', '', '15', '', '', ''],
    ])
  })

  it('conta linha em branco sem tratar como registro inválido', async () => {
    const { summary, clubs } = await run(['', '   ', '\t'])

    expect(summary.linesRead).toBe(3)
    expect(summary.blankLines).toBe(3)
    expect(summary.invalidJson).toBe(0)
    expect(clubs.rows).toEqual([])
  })

  it('conta linha acima do limite sem tentar interpretar o conteúdo', async () => {
    const clubs = fakeWriter()
    const players = fakeWriter()
    const withOversizedLine = async function* (): AsyncIterable<SourceLine> {
      yield { text: '', endOffset: 70_000_000, oversized: true }
      yield {
        text: jsonl({ club_id: 'CRB', championship: 'SERIE B' }),
        endOffset: 70_000_100,
        oversized: false,
      }
    }

    const summary = await processClubsFile(withOversizedLine(), clubs, players)

    expect(summary.oversizedLines).toBe(1)
    expect(summary.blankLines).toBe(0)
    expect(summary.invalidJson).toBe(0)
    expect(summary.clubsWritten).toBe(1)
  })

  it('conta JSON inválido e segue para a próxima linha', async () => {
    const { summary, clubs } = await run([
      'isso não é json',
      jsonl({ club_id: 'CRB', championship: 'SERIE B' }),
    ])

    expect(summary.invalidJson).toBe(1)
    expect(summary.clubsWritten).toBe(1)
    expect(clubs.rows).toHaveLength(1)
  })

  it('conta cada motivo de registro inválido separadamente', async () => {
    const { summary, clubs, players } = await run([
      jsonl(['não é objeto']),
      jsonl('também não'),
      jsonl(null),
      jsonl({ name: 'sem id', championship: 'SERIE A' }),
      jsonl({ club_id: '   ', championship: 'SERIE A' }),
    ])

    expect(summary.invalidRecords).toEqual({
      not_an_object: 3,
      missing_club_id: 2,
    })
    expect(clubs.rows).toEqual([])
    expect(players.rows).toEqual([])
  })

  it('players com tipo errado preserva o clube e conta a lista perdida', async () => {
    const { summary, clubs, players } = await run([
      jsonl({
        club_id: 'AVA',
        name: 'Avaí Futebol Clube',
        championship: 'SERIE B',
        players: 'nenhum',
      }),
    ])

    expect(summary.malformedPlayerLists).toBe(1)
    expect(summary.clubsWritten).toBe(1)
    expect(summary.playersWritten).toBe(0)
    expect(clubs.rows[0]?.slice(0, 2)).toEqual(['AVA', 'Avaí Futebol Clube'])
    expect(players.rows).toEqual([])
  })

  it('clube filtrado com players malformado não conta nada', async () => {
    const { summary, clubs } = await run([
      jsonl({ club_id: 'CAM', championship: 'SERIE C', players: 'nenhum' }),
    ])

    expect(summary.filteredOutClubs).toBe(1)
    expect(summary.malformedPlayerLists).toBe(0)
    expect(clubs.rows).toEqual([])
  })

  it('descarta só o jogador malformado no meio de jogadores válidos', async () => {
    const { summary, players } = await run([
      jsonl({
        club_id: 'SCCP',
        championship: 'SERIE A',
        players: [{ player_id: 'SCCP-10' }, 'jogador quebrado', { player_id: 'SCCP-9' }],
      }),
    ])

    expect(summary.invalidPlayers).toBe(1)
    expect(summary.playersWritten).toBe(2)
    expect(summary.clubsWritten).toBe(1)
    expect(players.rows.map((row) => row[1])).toEqual(['SCCP-10', 'SCCP-9'])
  })

  it('clube fora de Série A ou B não gera linha nenhuma, nem dos jogadores', async () => {
    const { summary, clubs, players } = await run([
      jsonl({
        club_id: 'SPFC',
        championship: 'Libertadores',
        players: [{ player_id: 'SPFC-1' }],
      }),
      jsonl({ club_id: 'CAM', championship: 'SERIE C' }),
      jsonl({ club_id: 'FLU' }),
    ])

    expect(summary.filteredOutClubs).toBe(3)
    expect(summary.invalidRecords.not_an_object).toBe(0)
    expect(clubs.rows).toEqual([])
    expect(players.rows).toEqual([])
  })

  it('aceita as variações de grafia do campeonato mantendo o valor original', async () => {
    const { summary, clubs } = await run([
      jsonl({ club_id: 'CRF', championship: 'Série A' }),
      jsonl({ club_id: 'CRB', championship: '  serie   b ' }),
    ])

    expect(summary.clubsWritten).toBe(2)
    expect(clubs.rows.map((row) => row[2])).toEqual(['Série A', '  serie   b '])
  })

  it('clube sem players entra em clubs e não gera linha em players', async () => {
    const { summary, clubs, players } = await run([
      jsonl({ club_id: 'CRB', championship: 'SERIE B' }),
      jsonl({ club_id: 'AVA', championship: 'SERIE B', players: null }),
      jsonl({ club_id: 'CAP', championship: 'SERIE B', players: [] }),
    ])

    expect(summary.clubsWritten).toBe(3)
    expect(summary.playersWritten).toBe(0)
    expect(clubs.rows).toHaveLength(3)
    expect(players.rows).toEqual([])
  })

  it('reporta progresso a cada intervalo de linhas lidas', async () => {
    const onProgress = vi.fn<(linesRead: number) => void>()
    const summary = await processClubsFile(
      repeat('', PROGRESS_INTERVAL * 2 + 1),
      fakeWriter(),
      fakeWriter(),
      { onProgress },
    )

    expect(summary.linesRead).toBe(PROGRESS_INTERVAL * 2 + 1)
    expect(onProgress.mock.calls).toEqual([[PROGRESS_INTERVAL], [PROGRESS_INTERVAL * 2]])
  })

  it('roda sem callback de progresso', async () => {
    const summary = await processClubsFile(
      repeat('', PROGRESS_INTERVAL),
      fakeWriter(),
      fakeWriter(),
      {},
    )

    expect(summary.linesRead).toBe(PROGRESS_INTERVAL)
    expect(summary.blankLines).toBe(PROGRESS_INTERVAL)
  })
})

describe('processClubsFile com checkpoint', () => {
  const club = (id: string): string =>
    jsonl({
      club_id: id,
      championship: 'SERIE B',
      players: [{ player_id: `${id}-1` }],
    })

  it('grava checkpoint no intervalo pedido, com offset e contadores do momento', async () => {
    const checkpoints: Array<{ offset: number; linesRead: number; clubsWritten: number }> = []
    const lines = [club('A'), club('B'), club('C'), club('D')]

    const summary = await processClubsFile(from(lines), fakeWriter(), fakeWriter(), {
      checkpointInterval: 2,
      onCheckpoint: async (offset, partial) => {
        checkpoints.push({
          offset,
          linesRead: partial.linesRead,
          clubsWritten: partial.clubsWritten,
        })
      },
    })

    expect(summary.linesRead).toBe(4)
    expect(checkpoints.map((p) => p.linesRead)).toEqual([2, 4])
    expect(checkpoints.map((p) => p.clubsWritten)).toEqual([2, 4])
    const bytes = (n: number): number =>
      lines.slice(0, n).reduce((total, l) => total + Buffer.byteLength(l, 'utf8') + 1, 0)
    expect(checkpoints.map((p) => p.offset)).toEqual([bytes(2), bytes(4)])
  })

  it('o checkpoint recebe uma cópia, imune a mudanças posteriores', async () => {
    const captured: Summary[] = []

    await processClubsFile(from([club('A'), club('B')]), fakeWriter(), fakeWriter(), {
      checkpointInterval: 1,
      onCheckpoint: async (_offset, partial) => {
        captured.push(partial)
      },
    })

    expect(captured[0]?.linesRead).toBe(1)
    expect(captured[1]?.linesRead).toBe(2)
    expect(captured[0]?.invalidRecords).not.toBe(captured[1]?.invalidRecords)
  })

  it('usa o intervalo padrão quando nenhum é informado', async () => {
    const onCheckpoint = vi.fn(async (): Promise<void> => {})

    await processClubsFile(repeat('', CHECKPOINT_INTERVAL), fakeWriter(), fakeWriter(), {
      onCheckpoint,
    })

    expect(onCheckpoint).toHaveBeenCalledTimes(1)
  })

  it('retomar continua os contadores de onde a execução anterior parou', async () => {
    const previous: Summary = {
      ...emptySummary(),
      linesRead: 500,
      blankLines: 7,
      clubsWritten: 480,
      playersWritten: 900,
    }

    const summary = await processClubsFile(
      from([club('A'), club('B')]),
      fakeWriter(),
      fakeWriter(),
      { resumeFrom: previous },
    )

    expect(summary.linesRead).toBe(502)
    expect(summary.blankLines).toBe(7)
    expect(summary.clubsWritten).toBe(482)
    expect(summary.playersWritten).toBe(902)
    expect(previous.linesRead).toBe(500)
  })

  it('o intervalo de checkpoint conta a partir das linhas já retomadas', async () => {
    const checkpoints: number[] = []

    await processClubsFile(from([club('A'), club('B')]), fakeWriter(), fakeWriter(), {
      resumeFrom: { ...emptySummary(), linesRead: 1000 },
      checkpointInterval: 2,
      onCheckpoint: async (_offset, partial) => {
        checkpoints.push(partial.linesRead)
      },
    })

    expect(checkpoints).toEqual([1002])
  })
})

describe('processClubsFile com parada', () => {
  const club = (id: string): string => jsonl({ club_id: id, championship: 'SERIE B' })

  const clubWithTwoPlayers = (id: string): string =>
    jsonl({
      club_id: id,
      championship: 'SERIE B',
      players: [{ player_id: `${id}-1` }, { player_id: `${id}-2` }],
    })

  it('para na fronteira do registro, sem publicar clube sem os jogadores dele', async () => {
    const checkpoints: number[] = []
    const clubs = fakeWriter()
    const players = fakeWriter()
    let stop = false

    const playersInterrupting: TabularWriter = {
      ...players,
      writeRow: async (row: readonly string[]): Promise<void> => {
        await players.writeRow(row)
        if (row[1] === 'B-1') stop = true
      },
    }

    const summary = await processClubsFile(
      from([clubWithTwoPlayers('A'), clubWithTwoPlayers('B'), clubWithTwoPlayers('C')]),
      clubs,
      playersInterrupting,
      {
        checkpointInterval: 1000,
        shouldStop: () => stop,
        onCheckpoint: async (_offset, partial) => {
          checkpoints.push(partial.linesRead)
        },
      },
    )

    expect(summary.linesRead).toBe(2)
    expect(clubs.rows.map((row) => row[0])).toEqual(['A', 'B'])
    expect(players.rows.map((row) => row[1])).toEqual(['A-1', 'A-2', 'B-1', 'B-2'])
    expect(summary.playersWritten).toBe(4)
    expect(checkpoints).toEqual([2])
  })

  it('parar antes do fim interrompe a varredura com checkpoint', async () => {
    const checkpoints: number[] = []
    let stopChecks = 0
    const clubs = fakeWriter()

    const summary = await processClubsFile(
      from([club('A'), club('B'), club('C'), club('D')]),
      clubs,
      fakeWriter(),
      {
        checkpointInterval: 1000,
        shouldStop: () => {
          stopChecks += 1
          return stopChecks >= 2
        },
        onCheckpoint: async (_offset, partial) => {
          checkpoints.push(partial.linesRead)
        },
      },
    )

    expect(summary.linesRead).toBe(2)
    expect(checkpoints).toEqual([2])
    expect(clubs.rows).toHaveLength(2)
  })

  it('shouldStop que nunca pede parada deixa o arquivo terminar', async () => {
    const summary = await processClubsFile(
      from([club('A'), club('B')]),
      fakeWriter(),
      fakeWriter(),
      { shouldStop: () => false },
    )

    expect(summary.linesRead).toBe(2)
  })
})
