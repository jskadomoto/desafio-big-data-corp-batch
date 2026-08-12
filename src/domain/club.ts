import { err, ok, type Result } from './result.ts'

export type RawRecord = Readonly<Record<string, unknown>>

export type Club = {
  readonly clubId: string
  readonly data: RawRecord
  readonly players: readonly unknown[]
  readonly malformedPlayers: boolean
}

export type InvalidRecordReason = 'not_an_object' | 'missing_club_id'

export const parseClub = (value: unknown): Result<Club, InvalidRecordReason> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return err('not_an_object')
  }
  const data = value as RawRecord
  const clubId = data['club_id']
  if (typeof clubId !== 'string' || clubId.trim().length === 0) {
    return err('missing_club_id')
  }
  const players = data['players']
  if (players === undefined || players === null) {
    return ok({ clubId, data, players: [], malformedPlayers: false })
  }
  if (!Array.isArray(players)) {
    return ok({ clubId, data, players: [], malformedPlayers: true })
  }
  return ok({ clubId, data, players, malformedPlayers: false })
}
