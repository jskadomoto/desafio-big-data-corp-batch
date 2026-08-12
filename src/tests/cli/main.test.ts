import { describe, expect, it } from 'vitest'
import { CHECKPOINT_INTERVAL, emptySummary, Summary } from '../../application/process-clubs-file.ts'
import {
  CHECKPOINT_INTERVAL_ENV,
  checkpointIntervalFrom,
  createShutdown,
  formatReport,
  isUsable,
  partialsMatch,
  toMessage,
} from '../../cli/main.ts'
import { AppError } from '../../cli/app-error.ts'
import { Checkpoint, CHECKPOINT_VERSION } from '../../infrastructure/checkpoint-store.ts'

const summary = (overrides: Partial<Summary> = {}): Summary => ({
  ...emptySummary(),
  ...overrides,
})

describe('toMessage', () => {
  it('usa a mensagem quando é um Error', () => {
    expect(toMessage(new Error('ENOENT: arquivo sumiu'))).toBe('ENOENT: arquivo sumiu')
  })

  it('converte para texto o que não é Error', () => {
    expect(toMessage('falhou feio')).toBe('falhou feio')
    expect(toMessage(42)).toBe('42')
  })
})

describe('formatReport', () => {
  it('lista todos os contadores, a duração e a taxa', () => {
    const report = formatReport(
      summary({
        linesRead: 2000,
        blankLines: 3,
        oversizedLines: 2,
        malformedPlayerLists: 7,
        invalidJson: 4,
        invalidRecords: {
          not_an_object: 5,
          missing_club_id: 6,
        },
        invalidPlayers: 8,
        filteredOutClubs: 9,
        clubsWritten: 10,
        playersWritten: 11,
      }),
      500,
    )

    expect(report).toContain('linhas lidas:                        2000')
    expect(report).toContain('linhas em branco:                    3')
    expect(report).toContain('linhas acima do limite:              2')
    expect(report).toContain('json inválido:                       4')
    expect(report).toContain('registros inválidos (não é objeto):  5')
    expect(report).toContain('registros inválidos (sem club_id):   6')
    expect(report).toContain('listas de jogadores malformadas:     7')
    expect(report).toContain('jogadores inválidos:                 8')
    expect(report).toContain('clubes filtrados (fora de A e B):    9')
    expect(report).toContain('clubes escritos:                     10')
    expect(report).toContain('jogadores escritos:                  11')
    expect(report).toContain('duração:                             500 ms (4000 linhas/s)')
    expect(report.endsWith('\n')).toBe(true)
  })

  it('não divide por zero quando o processamento não chega a 1 ms', () => {
    const report = formatReport(summary({ linesRead: 7 }), 0)

    expect(report).toContain('duração:                             0 ms (7000 linhas/s)')
  })
})

describe('checkpointIntervalFrom', () => {
  it('sem a variável, usa o intervalo padrão', () => {
    expect(checkpointIntervalFrom({})).toBe(CHECKPOINT_INTERVAL)
  })

  it('aceita inteiro positivo', () => {
    expect(checkpointIntervalFrom({ [CHECKPOINT_INTERVAL_ENV]: '2000' })).toBe(2000)
    expect(checkpointIntervalFrom({ [CHECKPOINT_INTERVAL_ENV]: '1' })).toBe(1)
  })

  it('value inválido derruba a execução em vez de cair no padrão em silêncio', () => {
    for (const value of ['zero', '0', '-5', '1.5', '', '1e3x']) {
      expect(() => checkpointIntervalFrom({ [CHECKPOINT_INTERVAL_ENV]: value })).toThrow(AppError)
    }
  })

  it('o erro é de uso, com o nome da variável na mensagem', () => {
    try {
      checkpointIntervalFrom({ [CHECKPOINT_INTERVAL_ENV]: 'nada' })
      expect.unreachable('deveria ter lançado')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).exitCode).toBe(1)
      expect((error as AppError).message).toContain(CHECKPOINT_INTERVAL_ENV)
      expect((error as AppError).message).toContain('nada')
    }
  })
})

describe('createShutdown', () => {
  it('começa sem interrupção registrada', () => {
    expect(createShutdown().interruption()).toBeUndefined()
  })

  it('registra 130 no SIGINT', () => {
    const shutdown = createShutdown()

    shutdown.handle('SIGINT')

    expect(shutdown.interruption()).toEqual({
      signal: 'SIGINT',
      exitCode: 130,
    })
  })

  it('registra 143 no SIGTERM', () => {
    const shutdown = createShutdown()

    shutdown.handle('SIGTERM')

    expect(shutdown.interruption()).toEqual({
      signal: 'SIGTERM',
      exitCode: 143,
    })
  })
})

describe('isUsable', () => {
  const checkpoint: Checkpoint = {
    version: CHECKPOINT_VERSION,
    inputSize: 1024,
    inputMtimeMs: 1_700_000_000_000,
    inputOffset: 512,
    outputs: { clubs: 300, players: 700 },
    summary: summary({ linesRead: 400 }),
  }

  it('aceita quando tamanho e mtime da entrada batem', () => {
    expect(isUsable(checkpoint, 1024, 1_700_000_000_000)).toBe(true)
  })

  it('recusa quando não há checkpoint', () => {
    expect(isUsable(null, 1024, 1_700_000_000_000)).toBe(false)
  })

  it('recusa quando a entrada mudou de tamanho', () => {
    expect(isUsable(checkpoint, 2048, 1_700_000_000_000)).toBe(false)
  })

  it('recusa quando a entrada foi modificada, mesmo com o mesmo tamanho', () => {
    expect(isUsable(checkpoint, 1024, 1_800_000_000_000)).toBe(false)
  })

  describe('partialsMatch', () => {
    it('aceita quando os dois parciais têm o que o checkpoint promete', () => {
      expect(partialsMatch(checkpoint, 300, 700)).toBe(true)
    })

    it('aceita parcial maior, que é a queda depois do último ponto seguro', () => {
      expect(partialsMatch(checkpoint, 812, 1900)).toBe(true)
    })

    it('recusa quando o parcial de clubes sumiu', () => {
      expect(partialsMatch(checkpoint, null, 700)).toBe(false)
    })

    it('recusa quando o parcial de jogadores sumiu', () => {
      expect(partialsMatch(checkpoint, 300, null)).toBe(false)
    })

    it('recusa parcial menor do que o prometido, em qualquer um dos dois', () => {
      expect(partialsMatch(checkpoint, 299, 700)).toBe(false)
      expect(partialsMatch(checkpoint, 300, 699)).toBe(false)
    })
  })
})
