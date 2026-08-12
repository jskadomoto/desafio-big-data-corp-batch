export type SourceLine = {
  readonly text: string
  readonly endOffset: number
  readonly oversized: boolean
}

export interface TabularWriter {
  writeRow(row: readonly string[]): Promise<void>
  sync(): Promise<number>
  close(): Promise<void>
  suspend(): Promise<void>
  discard(): Promise<void>
}
