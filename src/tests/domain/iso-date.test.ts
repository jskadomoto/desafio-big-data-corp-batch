import { describe, expect, it } from 'vitest'
import { toISODateField } from '../../domain/iso-date.ts'

describe('toISODateField', () => {
  it('mantém data já canônica em yyyy-MM-dd', () => {
    expect(toISODateField('1910-09-01')).toBe('1910-09-01')
    expect(toISODateField('2024-02-29')).toBe('2024-02-29')
  })

  it('converte data válida que não veio canônica', () => {
    expect(toISODateField('2024-1-5')).toBe('2024-01-05')
    expect(toISODateField('2024-01-18T00:00:00Z')).toBe('2024-01-18')
    expect(toISODateField('2024-01-18T13:45:00.123-03:00')).toBe('2024-01-18')
    expect(toISODateField('2024-01-18 00:00:00')).toBe('2024-01-18')
  })

  it('aceita dd/MM/yyyy como convenção brasileira', () => {
    expect(toISODateField('18/01/2024')).toBe('2024-01-18')
    expect(toISODateField('1/5/2024')).toBe('2024-05-01')
  })

  it('data de calendário impossível vira campo vazio, em qualquer formato', () => {
    expect(toISODateField('2024-02-30')).toBe('')
    expect(toISODateField('2023-02-29')).toBe('')
    expect(toISODateField('2024-13-01')).toBe('')
    expect(toISODateField('2024-00-10')).toBe('')
    expect(toISODateField('2024-01-00')).toBe('')
    expect(toISODateField('30/02/2024')).toBe('')
  })

  it('aplica a regra do século para 29 de fevereiro', () => {
    expect(toISODateField('2000-02-29')).toBe('2000-02-29')
    expect(toISODateField('1900-02-29')).toBe('')
  })

  it('o sufixo de hora é descartado sem ter o valor validado', () => {
    expect(toISODateField('2024-01-18T99:99:99Z')).toBe('2024-01-18')
    expect(toISODateField('2024-01-18 07:30')).toBe('2024-01-18')
  })

  it('texto colado depois da data vira campo vazio, não data limpa', () => {
    expect(toISODateField('1910-09-01 (fundado como CA Paulistano)')).toBe('')
    expect(toISODateField('2024-01-18 a confirmar')).toBe('')
    expect(toISODateField('2024-01-18Tbanana')).toBe('')
    expect(toISODateField('2024-01-18T')).toBe('')
  })

  it('preserva anos de dois e três dígitos sem empurrar para 1900', () => {
    expect(toISODateField('0099-12-31')).toBe('0099-12-31')
    expect(toISODateField('0001-01-01')).toBe('0001-01-01')
  })

  it('o que não é data reconhecível vira campo vazio', () => {
    expect(toISODateField('2024/01/18')).toBe('')
    expect(toISODateField('20240118')).toBe('')
    expect(toISODateField('18-01-2024')).toBe('')
    expect(toISODateField('ontem')).toBe('')
    expect(toISODateField('2024-01-18abc')).toBe('')
    expect(toISODateField('')).toBe('')
  })

  it('não string vira campo vazio, inclusive número', () => {
    expect(toISODateField(20240118)).toBe('')
    expect(toISODateField(1705536000000)).toBe('')
    expect(toISODateField(null)).toBe('')
    expect(toISODateField(undefined)).toBe('')
  })
})
