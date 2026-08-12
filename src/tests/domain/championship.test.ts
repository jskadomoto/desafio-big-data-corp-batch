import { describe, expect, it } from 'vitest'
import { isAllowedChampionship, normalizeChampionship } from '../../domain/championship.ts'

describe('normalizeChampionship', () => {
  it('normaliza acento, caixa e espaços', () => {
    expect(normalizeChampionship('Série A')).toBe('SERIE A')
    expect(normalizeChampionship('  serie   b ')).toBe('SERIE B')
  })

  it('não string ou string em branco vira null', () => {
    expect(normalizeChampionship(42)).toBeNull()
    expect(normalizeChampionship('   ')).toBeNull()
  })
})

describe('isAllowedChampionship', () => {
  it('aceita Série A e Série B em qualquer grafia', () => {
    expect(isAllowedChampionship('SERIE A')).toBe(true)
    expect(isAllowedChampionship('série b')).toBe(true)
  })

  it('rejeita outros campeonatos e valores inválidos', () => {
    expect(isAllowedChampionship('SERIE C')).toBe(false)
    expect(isAllowedChampionship('Premier League')).toBe(false)
    expect(isAllowedChampionship(null)).toBe(false)
  })
})
