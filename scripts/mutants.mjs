import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const MUTANTS = [
  {
    name: 'filtro de campeonato aceita qualquer valor',
    file: 'src/domain/championship.ts',
    from: 'return normalized !== null && ALLOWED.has(normalized)',
    to: 'return normalized !== null',
  },
  {
    name: 'calendário deixa de ser conferido',
    file: 'src/domain/iso-date.ts',
    from: 'day >= 1 && day <= daysInMonth(year, month)',
    to: 'true',
  },
  {
    name: 'dia zero passa a ser aceito',
    file: 'src/domain/iso-date.ts',
    from: 'day >= 1 && day <= daysInMonth(year, month)',
    to: 'day <= daysInMonth(year, month)',
  },
  {
    name: 'regra do século ignorada em 29 de fevereiro',
    file: 'src/domain/iso-date.ts',
    from: 'year % 400 === 0',
    to: 'false',
  },
  {
    name: 'mês fora da faixa passa a ter 31 dias',
    file: 'src/domain/iso-date.ts',
    from: '?? 0',
    to: '?? 31',
  },
  {
    name: 'data não canônica deixa de ser convertida',
    file: 'src/domain/iso-date.ts',
    from: String.raw`const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](.*))?$/`,
    to: String.raw`const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](.*))?$/`,
  },
  {
    name: 'texto colado depois da data volta a virar data limpa',
    file: 'src/domain/iso-date.ts',
    from: "if (hour !== undefined && !HOUR.test(hour)) return ''",
    to: 'void hour',
  },
  {
    name: 'data sem sufixo passa a ser validada como se tivesse hora',
    file: 'src/domain/iso-date.ts',
    from: 'if (hour !== undefined && !HOUR.test(hour))',
    to: 'if (!HOUR.test(hour))',
  },
  {
    name: 'guarda do sufixo vira teste de veracidade e aceita separador solto',
    file: 'src/domain/iso-date.ts',
    from: 'if (hour !== undefined && !HOUR.test(hour))',
    to: 'if (hour && !HOUR.test(hour))',
  },
  {
    name: 'formato brasileiro deixa de ser aceito',
    file: 'src/domain/iso-date.ts',
    from: 'const br = DATE_BR.exec(value)',
    to: 'const br = null',
  },
  {
    name: 'cores unidas por vírgula em vez de pipe',
    file: 'src/domain/field.ts',
    from: ".join('|')",
    to: ".join(',')",
  },
  {
    name: 'campo ausente vira texto em vez de vazio',
    file: 'src/domain/field.ts',
    from: "  return ''\n}",
    to: '  return String(value)\n}',
  },
  {
    name: 'players malformado volta a derrubar o clube inteiro',
    file: 'src/domain/club.ts',
    from: 'return ok({ clubId, data, players: [], malformedPlayers: true })',
    to: "return err('not_an_object')",
  },
  {
    name: 'club_id em branco passa a ser aceito',
    file: 'src/domain/club.ts',
    from: "typeof clubId !== 'string' || clubId.trim().length === 0",
    to: "typeof clubId !== 'string'",
  },
  {
    name: 'escape de CSV desligado',
    file: 'src/infrastructure/csv-file-writer.ts',
    from: 'NEEDS_QUOTES.test(field) ?',
    to: 'false ?',
  },
  {
    name: 'aspas internas não são duplicadas',
    file: 'src/infrastructure/csv-file-writer.ts',
    from: 'field.replaceAll',
    to: 'field.replace',
  },
  {
    name: 'linha do CSV termina em CRLF',
    file: 'src/infrastructure/csv-file-writer.ts',
    from: "join(',')}\\n`",
    to: "join(',')}\\r\\n`",
  },
  {
    name: 'teto de tamanho por linha desligado',
    file: 'src/infrastructure/jsonl-file-source.ts',
    from: 'if (bytes + rest.length > maxLineBytes) {',
    to: 'if (false) {',
  },
  {
    name: 'offset em bytes com off-by-one',
    file: 'src/infrastructure/jsonl-file-source.ts',
    from: 'base + newline + 1',
    to: 'base + newline',
  },
  {
    name: '\\r do CRLF deixa de ser removido',
    file: 'src/infrastructure/jsonl-file-source.ts',
    from: 'line.subarray(0, -1)',
    to: 'line',
  },
  {
    name: 'checkpoint gravado sem tmp+rename',
    file: 'src/infrastructure/checkpoint-store.ts',
    from: 'const tmpPath = `${path}.tmp`',
    to: 'const tmpPath = path',
  },
  {
    name: 'sync() sem fsync',
    file: 'src/infrastructure/csv-file-writer.ts',
    from: 'await flush()\n      await handle.sync()\n      return bytes',
    to: 'await flush()\n      return bytes',
  },
  {
    name: 'close() sem fsync antes do rename',
    file: 'src/infrastructure/csv-file-writer.ts',
    from: 'await flush()\n      await handle.sync()\n      await handle.close()\n      await rename',
    to: 'await flush()\n      await handle.close()\n      await rename',
  },
  {
    name: 'checkpoint gravado antes de efetivar as saídas',
    file: 'src/cli/main.ts',
    from: 'const clubs = await clubsWriter.sync()\n  const players = await playersWriter.sync()\n  await store.save({',
    to: 'await store.save({',
  },
  {
    name: 'retomada não trunca o parcial',
    file: 'src/infrastructure/csv-file-writer.ts',
    from: 'await handle.truncate(resumeFromBytes)',
    to: 'void 0',
  },
  {
    name: 'tamanhos das duas saídas trocados no checkpoint',
    file: 'src/cli/main.ts',
    from: 'outputs: { clubs, players },',
    to: 'outputs: { clubs: players, players: clubs },',
  },
  {
    name: 'retoma mesmo com a entrada alterada',
    file: 'src/cli/main.ts',
    from: 'const matchesInput = isUsable(saved, input.size, input.mtimeMs)',
    to: 'const matchesInput = saved !== null',
  },
  {
    name: 'checkpoint órfão volta a ser aceito e trava o diretório',
    file: 'src/cli/main.ts',
    from: '  clubs !== null &&\n  players !== null &&',
    to: '  true ||',
  },
  {
    name: 'parcial menor do que o prometido passa a ser aceito',
    file: 'src/cli/main.ts',
    from: '  clubs >= checkpoint.outputs.clubs &&\n  players >= checkpoint.outputs.players',
    to: '  true',
  },
  {
    name: 'checkpoint não é apagado no sucesso',
    file: 'src/cli/main.ts',
    from: 'await playersWriter.close()\n    await store.clear()',
    to: 'await playersWriter.close()',
  },
  {
    name: 'falha sempre descarta o parcial',
    file: 'src/cli/main.ts',
    from: 'const recoverable = (await store.load()) !== null',
    to: 'const recoverable = false',
  },
  {
    name: 'falha sempre preserva o parcial',
    file: 'src/cli/main.ts',
    from: 'const recoverable = (await store.load()) !== null',
    to: 'const recoverable = true',
  },
  {
    name: 'contadores não são retomados',
    file: 'src/application/process-clubs-file.ts',
    from: 'resumeFrom === undefined ? emptySummary() : copySummary(resumeFrom)',
    to: 'emptySummary()',
  },
  {
    name: 'checkpoint recebe referência em vez de cópia',
    file: 'src/application/process-clubs-file.ts',
    from: 'await onCheckpoint(line.endOffset, copySummary(summary))',
    to: 'await onCheckpoint(line.endOffset, summary)',
  },
  {
    name: 'Ctrl-C deixa de parar o processamento',
    file: 'src/application/process-clubs-file.ts',
    from: 'const stopping = shouldStop?.() === true',
    to: 'const stopping = false',
  },
  {
    name: 'intervalo inválido cai no padrão em silêncio',
    file: 'src/cli/main.ts',
    from: 'throw new AppError(\n      EXIT_USAGE,',
    to: 'return CHECKPOINT_INTERVAL; throw new AppError(\n      EXIT_USAGE,',
  },
]

const runSuite = () =>
  spawnSync('npx', ['vitest', 'run', '--silent'], {
    stdio: 'ignore',
    shell: false,
  }).status === 0

console.error(`rodando ${MUTANTS.length} mutantes\n`)

const survivors = []
let index = 0

let applied = null

const restore = () => {
  if (applied === null) return
  writeFileSync(applied.file, applied.original)
  applied = null
}

process.on('SIGINT', () => {
  restore()
  process.exit(130)
})
process.on('SIGTERM', () => {
  restore()
  process.exit(143)
})

for (const { name, file, from, to } of MUTANTS) {
  index += 1
  const original = readFileSync(file, 'utf8')

  if (!original.includes(from)) {
    console.error(`  [${index}] PADRÃO NÃO ENCONTRADO  ${name} (${file})`)
    survivors.push(`${name} (padrão desatualizado em ${file})`)
    continue
  }

  applied = { file, original }
  writeFileSync(file, original.replace(from, to))
  try {
    if (runSuite()) {
      console.error(`  [${index}] SOBREVIVEU            ${name}`)
      survivors.push(name)
    } else {
      console.error(`  [${index}] pego                  ${name}`)
    }
  } finally {
    restore()
  }
}

const killed = MUTANTS.length - survivors.length
console.error(`\n${killed}/${MUTANTS.length} mutantes pegos pela suíte`)

if (survivors.length > 0) {
  console.error('\nlacunas de teste:')
  for (const name of survivors) console.error(`  - ${name}`)
  process.exit(1)
}
