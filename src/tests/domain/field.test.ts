import { describe, expect, it } from 'vitest'
import { joinColors, toTextField } from '../../domain/field.ts'

describe('toTextField', () => {
  it('mantém string como veio, sem trim', () => {
    expect(toTextField('Neo Química Arena')).toBe('Neo Química Arena')
    expect(toTextField(' SP ')).toBe(' SP ')
  })

  it('converte número finito para string', () => {
    expect(toTextField(26)).toBe('26')
    expect(toTextField(0)).toBe('0')
  })

  it('número não finito vira campo vazio', () => {
    expect(toTextField(Number.NaN)).toBe('')
    expect(toTextField(Infinity)).toBe('')
  })

  it('ausente, nulo e tipos não representáveis viram campo vazio', () => {
    expect(toTextField(undefined)).toBe('')
    expect(toTextField(null)).toBe('')
    expect(toTextField({ a: 1 })).toBe('')
    expect(toTextField(true)).toBe('')
  })
})

describe('joinColors', () => {
  it('une cores com pipe', () => {
    expect(joinColors(['preto', 'branco'])).toBe('preto|branco')
  })

  it('lista vazia, ausente ou tipo errado vira campo vazio', () => {
    expect(joinColors([])).toBe('')
    expect(joinColors(undefined)).toBe('')
    expect(joinColors('preto')).toBe('')
  })

  it('descarta itens que não são string não vazia', () => {
    expect(joinColors(['preto', '', 3, 'branco'])).toBe('preto|branco')
  })
})
