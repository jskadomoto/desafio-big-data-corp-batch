import { isAllowedChampionship } from '../domain/championship.ts'
import { parseClub, type InvalidRecordReason } from '../domain/club.ts'
import { parsePlayer } from '../domain/player.ts'
import { clubToRow, playerToRow } from '../domain/transform.ts'
import type { SourceLine, TabularWriter } from './ports.ts'

export const PROGRESS_INTERVAL = 100_000

export const CHECKPOINT_INTERVAL = 100_000

export type Summary = {
  linesRead: number
  blankLines: number
  oversizedLines: number
  malformedPlayerLists: number
  invalidJson: number
  invalidRecords: Record<InvalidRecordReason, number>
  invalidPlayers: number
  filteredOutClubs: number
  clubsWritten: number
  playersWritten: number
}

export type ProcessOptions = {
  readonly resumeFrom?: Summary
  readonly onProgress?: (linesRead: number) => void
  readonly onCheckpoint?: (inputOffset: number, summary: Summary) => Promise<void>
  readonly checkpointInterval?: number
  readonly shouldStop?: () => boolean
}

export const emptySummary = (): Summary => ({
  linesRead: 0,
  blankLines: 0,
  oversizedLines: 0,
  malformedPlayerLists: 0,
  invalidJson: 0,
  invalidRecords: {
    not_an_object: 0,
    missing_club_id: 0,
  },
  invalidPlayers: 0,
  filteredOutClubs: 0,
  clubsWritten: 0,
  playersWritten: 0,
})

const copySummary = (summary: Summary): Summary => ({
  ...summary,
  invalidRecords: { ...summary.invalidRecords },
})

export const processClubsFile = async (
  lines: AsyncIterable<SourceLine>,
  clubsWriter: TabularWriter,
  playersWriter: TabularWriter,
  options: ProcessOptions = {},
): Promise<Summary> => {
  const { resumeFrom, onProgress, onCheckpoint, shouldStop } = options
  const checkpointInterval = options.checkpointInterval ?? CHECKPOINT_INTERVAL
  const summary = resumeFrom === undefined ? emptySummary() : copySummary(resumeFrom)
  let checkpointedAt = summary.linesRead

  for await (const line of lines) {
    summary.linesRead += 1
    if (summary.linesRead % PROGRESS_INTERVAL === 0) {
      onProgress?.(summary.linesRead)
    }

    await processLine(line, summary, clubsWriter, playersWriter)

    const stopping = shouldStop?.() === true
    const due = summary.linesRead - checkpointedAt >= checkpointInterval
    if (onCheckpoint !== undefined && (stopping || due)) {
      await onCheckpoint(line.endOffset, copySummary(summary))
      checkpointedAt = summary.linesRead
    }
    if (stopping) break
  }

  return summary
}

const processLine = async (
  line: SourceLine,
  summary: Summary,
  clubsWriter: TabularWriter,
  playersWriter: TabularWriter,
): Promise<void> => {
  if (line.oversized) {
    summary.oversizedLines += 1
    return
  }

  if (line.text.trim().length === 0) {
    summary.blankLines += 1
    return
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(line.text)
  } catch {
    summary.invalidJson += 1
    return
  }

  const club = parseClub(parsed)
  if (!club.ok) {
    summary.invalidRecords[club.error] += 1
    return
  }

  if (!isAllowedChampionship(club.value.data['championship'])) {
    summary.filteredOutClubs += 1
    return
  }

  if (club.value.malformedPlayers) {
    summary.malformedPlayerLists += 1
  }

  await clubsWriter.writeRow(clubToRow(club.value))
  summary.clubsWritten += 1

  for (const rawPlayer of club.value.players) {
    const player = parsePlayer(rawPlayer)
    if (!player.ok) {
      summary.invalidPlayers += 1
      continue
    }
    await playersWriter.writeRow(playerToRow(club.value.clubId, player.value))
    summary.playersWritten += 1
  }
}
