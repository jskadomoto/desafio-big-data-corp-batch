import { Club, RawRecord } from './club.ts'
import { joinColors, toTextField } from './field.ts'
import { toISODateField } from './iso-date.ts'

export const CLUB_HEADERS = [
  'Id do Clube',
  'Nome',
  'Campeonato',
  'Data de Fundação',
  'Cidade',
  'Estado',
  'País',
  'Estádio',
  'Presidente',
  'Apelido',
  'Cores',
] as const

export const PLAYER_HEADERS = [
  'Id do Clube',
  'Id do Jogador',
  'Nome',
  'Idade',
  'Gols',
  'Data de Estreia',
  'Posição',
  'Número da Camisa',
] as const

export const clubToRow = (club: Club): readonly string[] => {
  const d = club.data
  return [
    club.clubId,
    toTextField(d['name']),
    toTextField(d['championship']),
    toISODateField(d['founding_date']),
    toTextField(d['city']),
    toTextField(d['state']),
    toTextField(d['country']),
    toTextField(d['stadium']),
    toTextField(d['president']),
    toTextField(d['nickname']),
    joinColors(d['colors']),
  ]
}

export const playerToRow = (clubId: string, player: RawRecord): readonly string[] => [
  clubId,
  toTextField(player['player_id']),
  toTextField(player['name']),
  toTextField(player['age']),
  toTextField(player['goals']),
  toISODateField(player['debut_date']),
  toTextField(player['position']),
  toTextField(player['shirt_number']),
]
