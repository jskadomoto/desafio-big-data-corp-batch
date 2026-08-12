import { describe, expect, it } from 'vitest'
import { parsePlayer } from '../../../src/domain/player.ts'

describe('parsePlayer', () => {
  it('aceita entrada que é objeto', () => {
    const r = parsePlayer({ player_id: 'SCCP-10', name: 'Rodrigo Garro' })
    expect(r.ok && r.value['player_id']).toBe('SCCP-10')
  })

  it('rejeita entradas que não são objeto, sem invalidar o clube', () => {
    expect(parsePlayer(null).ok).toBe(false)
    expect(parsePlayer('SCCP-10').ok).toBe(false)
    expect(parsePlayer(['SCCP-10']).ok).toBe(false)
  })
})
