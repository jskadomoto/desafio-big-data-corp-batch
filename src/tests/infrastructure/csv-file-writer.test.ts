import { describe, expect, it } from 'vitest'
import { escapeCsvField } from '../../infrastructure/csv-file-writer.ts'

describe('escapeCsvField', () => {
  it('devolve como veio o campo que não precisa de escape', () => {
    expect(escapeCsvField('Sport Club Corinthians Paulista')).toBe(
      'Sport Club Corinthians Paulista',
    )
    expect(escapeCsvField('')).toBe('')
    expect(escapeCsvField('preto|branco')).toBe('preto|branco')
    expect(escapeCsvField(' com espaço ')).toBe(' com espaço ')
  })

  it('põe entre aspas o campo com vírgula', () => {
    expect(escapeCsvField('Mengão, o Rubro-Negro')).toBe('"Mengão, o Rubro-Negro"')
  })

  it('põe entre aspas e duplica as aspas internas', () => {
    expect(escapeCsvField('Clube "Aspas"')).toBe('"Clube ""Aspas"""')
    expect(escapeCsvField('"')).toBe('""""')
  })

  it('põe entre aspas o campo com quebra de linha', () => {
    expect(escapeCsvField('quebra\nde linha')).toBe('"quebra\nde linha"')
    expect(escapeCsvField('carriage\rreturn')).toBe('"carriage\rreturn"')
  })
})
