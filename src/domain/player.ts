import { RawRecord } from './club.ts'
import { err, ok, type Result } from './result.ts'

export type InvalidPlayerReason = 'player_not_an_object'

export const parsePlayer = (value: unknown): Result<RawRecord, InvalidPlayerReason> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return err('player_not_an_object')
  }
  return ok(value as RawRecord)
}
