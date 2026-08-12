import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SourceLine } from '../../application/ports.ts'
import { linesFrom, LineSourceOptions } from '../../infrastructure/jsonl-file.source.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'desafio-batch-source-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const writeInput = async (name: string, content: string): Promise<string> => {
  const path = join(dir, name)
  await writeFile(path, content, 'utf8')
  return path
}

const collect = async (path: string, options?: LineSourceOptions): Promise<SourceLine[]> => {
  const lines: SourceLine[] = []
  for await (const line of linesFrom(path, options)) {
    lines.push(line)
  }
  return lines
}

const texts = (lines: readonly SourceLine[]): string[] => lines.map((l) => l.text)

describe('linesFrom', () => {
  it('lê o arquivo linha a linha, inclusive a última sem quebra no fim', async () => {
    const path = await writeInput('entrada.jsonl', '{"club_id":"SCCP"}\n\n{"club_id":"CRB"}')

    expect(texts(await collect(path))).toEqual(['{"club_id":"SCCP"}', '', '{"club_id":"CRB"}'])
  })

  it('trata CRLF como uma quebra só, sem deixar \\r no fim da linha', async () => {
    const path = await writeInput('windows.jsonl', '{"club_id":"SCCP"}\r\n{"club_id":"CRB"}\r\n')

    expect(texts(await collect(path))).toEqual(['{"club_id":"SCCP"}', '{"club_id":"CRB"}'])
  })

  it('preserva acentuação lendo como UTF-8', async () => {
    const path = await writeInput('acentos.jsonl', '{"city":"São Paulo","stadium":"Maracanã"}\n')

    expect(texts(await collect(path))).toEqual(['{"city":"São Paulo","stadium":"Maracanã"}'])
  })

  it('não quebra caractere multibyte na fronteira dos blocos lidos', async () => {
    const longLine = 'ã'.repeat(50_000)
    const path = await writeInput('multibyte.jsonl', `${longLine}\n${longLine}\n`)

    const lines = await collect(path)

    expect(lines).toHaveLength(2)
    expect(lines[0]?.text).toBe(longLine)
    expect(lines[1]?.text).toBe(longLine)
  })

  it('entrega o offset em bytes do fim de cada linha', async () => {
    const path = await writeInput('offsets.jsonl', 'ab\ncde\n\nf\n')

    expect(await collect(path)).toEqual([
      { text: 'ab', endOffset: 3, oversized: false },
      { text: 'cde', endOffset: 7, oversized: false },
      { text: '', endOffset: 8, oversized: false },
      { text: 'f', endOffset: 10, oversized: false },
    ])
  })

  it('conta o offset em bytes, não em caracteres', async () => {
    const path = await writeInput('bytes.jsonl', 'ção\nx\n')

    expect((await collect(path)).map((l) => l.endOffset)).toEqual([6, 8])
  })

  it('o offset da última linha sem quebra é o tamanho do arquivo', async () => {
    const path = await writeInput('sem-quebra.jsonl', 'abc\ndef')

    expect((await collect(path)).map((l) => l.endOffset)).toEqual([4, 7])
  })

  it('retoma exatamente do offset informado', async () => {
    const path = await writeInput('retomada.jsonl', 'ab\ncde\nfg\n')

    const lines = await collect(path, { startOffset: 3 })

    expect(lines).toEqual([
      { text: 'cde', endOffset: 7, oversized: false },
      { text: 'fg', endOffset: 10, oversized: false },
    ])
  })

  it('retomar do fim do arquivo não entrega linha nenhuma', async () => {
    const path = await writeInput('fim.jsonl', 'ab\ncde\n')

    expect(await collect(path, { startOffset: 7 })).toEqual([])
  })

  it('linha acima do limite é marcada e descartada, sem derrubar o resto', async () => {
    const oversizedLine = 'x'.repeat(300_000)
    const path = await writeInput('gigante.jsonl', `pequena\n${oversizedLine}\ndepois\n`)

    const lines = await collect(path, { maxLineBytes: 100_000 })

    expect(lines.map((l) => [l.text, l.oversized])).toEqual([
      ['pequena', false],
      ['', true],
      ['depois', false],
    ])
    expect(lines[2]?.endOffset).toBe(8 + oversizedLine.length + 1 + 7)
  })

  it('linha acima do limite no fim do arquivo, sem quebra, também é marcada', async () => {
    const oversizedLine = 'x'.repeat(300_000)
    const path = await writeInput('gigante-fim.jsonl', `ok\n${oversizedLine}`)

    const lines = await collect(path, { maxLineBytes: 100_000 })

    expect(lines.map((l) => [l.text, l.oversized])).toEqual([
      ['ok', false],
      ['', true],
    ])
    expect(lines[1]?.endOffset).toBe(3 + oversizedLine.length)
  })

  it('propaga erro de leitura pela iteração quando o arquivo não existe', async () => {
    await expect(collect(join(dir, 'nao-existe.jsonl'))).rejects.toThrow(/ENOENT/)
  })

  it('encerra a leitura quando o consumidor para no meio', async () => {
    const lines = Array.from({ length: 500 }, (_, i) => `{"club_id":"C${i}"}`)
    const path = await writeInput('grande.jsonl', `${lines.join('\n')}\n`)

    const consumed: string[] = []
    for await (const line of linesFrom(path)) {
      consumed.push(line.text)
      if (consumed.length === 3) break
    }

    expect(consumed).toEqual(['{"club_id":"C0"}', '{"club_id":"C1"}', '{"club_id":"C2"}'])
  })
})
