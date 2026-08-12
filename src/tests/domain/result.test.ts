import { describe, expect, it } from 'vitest'
import { err, ok, type Result } from '../../domain/result.ts'

describe('Result', () => {
  it('ok carrega o valor e marca sucesso', () => {
    const r: Result<number, string> = ok(42)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toBe(42)
    }
  })

  it('err carrega o erro e marca falha', () => {
    const r: Result<number, string> = err('registro inválido')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe('registro inválido')
    }
  })
})
