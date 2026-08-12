import { describe, expect, it } from 'vitest'
import { parseClub } from '../../domain/club.ts'

describe('parseClub', () => {
  it('aceita clube com club_id e lista de jogadores', () => {
    const r = parseClub({
      club_id: 'SCCP',
      players: [{ player_id: 'SCCP-10' }],
    })
    expect(r.ok && r.value.clubId).toBe('SCCP')
    expect(r.ok && r.value.players).toHaveLength(1)
    expect(r.ok && r.value.malformedPlayers).toBe(false)
  })

  it('players ausente ou nulo vira lista vazia, sem marcar malformação', () => {
    const playersMissing = parseClub({ club_id: 'SCCP' })
    expect(playersMissing.ok && playersMissing.value.players).toEqual([])
    expect(playersMissing.ok && playersMissing.value.malformedPlayers).toBe(false)
    const playersNull = parseClub({ club_id: 'SCCP', players: null })
    expect(playersNull.ok && playersNull.value.players).toEqual([])
    expect(playersNull.ok && playersNull.value.malformedPlayers).toBe(false)
  })

  it('rejeita o que não é objeto', () => {
    expect(parseClub('SCCP')).toEqual({ ok: false, error: 'not_an_object' })
    expect(parseClub(null)).toEqual({ ok: false, error: 'not_an_object' })
    expect(parseClub([1, 2])).toEqual({ ok: false, error: 'not_an_object' })
  })

  it('rejeita club_id ausente, em branco ou de outro tipo', () => {
    expect(parseClub({})).toEqual({ ok: false, error: 'missing_club_id' })
    expect(parseClub({ club_id: '   ' })).toEqual({
      ok: false,
      error: 'missing_club_id',
    })
    expect(parseClub({ club_id: 10 })).toEqual({
      ok: false,
      error: 'missing_club_id',
    })
  })

  it('players com tipo errado preserva o clube, marcando a lista como perdida', () => {
    expect(parseClub({ club_id: 'SCCP', name: 'Corinthians', players: 'nenhum' })).toEqual({
      ok: true,
      value: {
        clubId: 'SCCP',
        data: { club_id: 'SCCP', name: 'Corinthians', players: 'nenhum' },
        players: [],
        malformedPlayers: true,
      },
    })
    expect(parseClub({ club_id: 'SCCP', players: 42 }).ok).toBe(true)
  })
})
