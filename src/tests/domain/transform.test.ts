import { describe, expect, it } from 'vitest'
import { parseClub } from '../../domain/club.ts'
import { CLUB_HEADERS, PLAYER_HEADERS, clubToRow, playerToRow } from '../../domain/transform.ts'

const corinthians = {
  club_id: 'SCCP',
  name: 'Sport Club Corinthians Paulista',
  championship: 'SERIE A',
  founding_date: '1910-09-01',
  city: 'São Paulo',
  state: 'SP',
  country: 'Brasil',
  stadium: 'Neo Química Arena',
  president: 'Augusto Melo',
  nickname: 'Timão',
  colors: ['preto', 'branco'],
  titles: 30,
  players: [],
}

describe('clubToRow', () => {
  it('gera a linha na ordem exata das colunas, ignorando campos extras', () => {
    const club = parseClub(corinthians)
    expect(club.ok).toBe(true)
    if (club.ok) {
      expect(clubToRow(club.value)).toEqual([
        'SCCP',
        'Sport Club Corinthians Paulista',
        'SERIE A',
        '1910-09-01',
        'São Paulo',
        'SP',
        'Brasil',
        'Neo Química Arena',
        'Augusto Melo',
        'Timão',
        'preto|branco',
      ])
    }
  })

  it('campos ausentes, nulos ou inválidos viram vazio sem derrubar a linha', () => {
    const club = parseClub({
      club_id: 'XYZ',
      nickname: null,
      founding_date: '1900-02-30',
    })
    expect(club.ok).toBe(true)
    if (club.ok) {
      expect(clubToRow(club.value)).toEqual(['XYZ', '', '', '', '', '', '', '', '', '', ''])
    }
  })
})

describe('playerToRow', () => {
  it('gera a linha do jogador com o club_id do clube, ignorando campos extras', () => {
    expect(
      playerToRow('SCCP', {
        player_id: 'SCCP-10',
        name: 'Rodrigo Garro',
        age: 26,
        goals: 8,
        debut_date: '2024-01-18',
        position: 'Meia',
        shirt_number: 10,
        nationality: 'Argentina',
        market_value: 12000000,
      }),
    ).toEqual(['SCCP', 'SCCP-10', 'Rodrigo Garro', '26', '8', '2024-01-18', 'Meia', '10'])
  })

  it('jogador com campos faltando gera linha com vazios', () => {
    expect(playerToRow('SCCP', { debut_date: 'não é data' })).toEqual([
      'SCCP',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ])
  })
})

describe('headers', () => {
  it('seguem exatamente o enunciado, com acento e ordem', () => {
    expect(CLUB_HEADERS).toEqual([
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
    ])
    expect(PLAYER_HEADERS).toEqual([
      'Id do Clube',
      'Id do Jogador',
      'Nome',
      'Idade',
      'Gols',
      'Data de Estreia',
      'Posição',
      'Número da Camisa',
    ])
  })
})
