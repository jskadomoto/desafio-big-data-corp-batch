import { createWriteStream } from 'node:fs'
import { once } from 'node:events'

const destination = process.argv[2]
const total = Number(process.argv[3] ?? 1_000_000)

if (destination === undefined) {
  process.stderr.write('usage: node scripts/generate-sample.mjs <destination.jsonl> [total]\n')
  process.exit(1)
}

let seed = 42
const next = () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}
const pick = (list) => list[Math.floor(next() * list.length)]

const CHAMPIONSHIPS = [
  'SERIE A',
  'Série A',
  'serie a',
  'SERIE B',
  '  serie   b ',
  'SERIE C',
  'Libertadores',
  'NO CHAMPIONSHIP',
]
const CITIES = [
  ['São Paulo', 'SP'],
  ['Rio de Janeiro', 'RJ'],
  ['Belo Horizonte', 'MG'],
  ['Porto Alegre', 'RS'],
  ['Maceió', 'AL'],
  ['Florianópolis', 'SC'],
]
const POSITIONS = ['Goalkeeper', 'Defender', 'Defensive Midfielder', 'Midfielder', 'Forward']

const club = (i) => {
  const [city, state] = pick(CITIES)
  const players = []
  const count = Math.floor(next() * 5)
  for (let j = 0; j < count; j += 1) {
    // um jogador em cada 200 vem malformado
    if (next() < 0.005) {
      players.push('broken player')
      continue
    }
    players.push({
      player_id: `C${i}-${j}`,
      name: `Player ${i}-${j}`,
      age: 18 + Math.floor(next() * 20),
      goals: Math.floor(next() * 30),
      // uma data em cada 50 vem fora do formato canonico
      debut_date: next() < 0.02 ? '20/01/2024' : '2023-05-10',
      position: pick(POSITIONS),
      shirt_number: 1 + Math.floor(next() * 40),
      nationality: 'Brazil',
      market_value: Math.floor(next() * 50_000_000),
    })
  }
  return {
    club_id: `C${i}`,
    // um clube em cada 100 tem nome com virgula e aspas, para exercitar o escape
    name: next() < 0.01 ? `Club "C${i}", the Team` : `Sports Club Number ${i}`,
    championship: pick(CHAMPIONSHIPS),
    founding_date: next() < 0.01 ? '1912-02-30' : '1912-09-20',
    city: city,
    state: state,
    country: 'Brazil',
    stadium: `Stadium ${i}`,
    president: `President ${i}`,
    // um apelido em cada 50 vem nulo
    nickname: next() < 0.02 ? null : `Nickname ${i}`,
    colors: ['red', 'white'],
    titles: Math.floor(next() * 30),
    players: players,
  }
}

const stream = createWriteStream(destination)
const write = async (text) => {
  if (!stream.write(text)) await once(stream, 'drain')
}

let batch = ''
for (let i = 0; i < total; i += 1) {
  const chance = next()
  if (chance < 0.002) {
    batch += '\n' // linha em branco
  } else if (chance < 0.004) {
    batch += `{"club_id":"C${i}","championship":"SERIE A"\n` // json quebrado
  } else if (chance < 0.006) {
    batch += `{"name":"Club without id","championship":"SERIE A"}\n` // sem club_id
  } else if (chance < 0.008) {
    batch += `{"club_id":"C${i}","championship":"SERIE B","players":"none"}\n`
  } else if (chance < 0.009) {
    batch += `["C${i}","not an object"]\n`
  } else {
    batch += `${JSON.stringify(club(i))}\n`
  }

  if (batch.length >= 1_000_000) {
    await write(batch)
    batch = ''
  }
}
if (batch.length > 0) await write(batch)

stream.end()
await once(stream, 'finish')
process.stderr.write(`${total} records written to ${destination}\n`)
