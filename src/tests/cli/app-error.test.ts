import { describe, expect, it } from 'vitest'
import { AppError } from '../../../src/cli/app-error.ts'

describe('AppError', () => {
  it('carrega exit code e mensagem, e continua sendo um Error', () => {
    const error = new AppError(2, 'falha de escrita')

    expect(error).toBeInstanceOf(Error)
    expect(error.exitCode).toBe(2)
    expect(error.message).toBe('falha de escrita')
    expect(error.name).toBe('AppError')
  })
})
