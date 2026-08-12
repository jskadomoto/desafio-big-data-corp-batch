const ALLOWED = new Set(['SERIE A', 'SERIE B'])

export const normalizeChampionship = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const normalized = value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
  return normalized.length > 0 ? normalized : null
}

export const isAllowedChampionship = (value: unknown): boolean => {
  const normalized = normalizeChampionship(value)
  return normalized !== null && ALLOWED.has(normalized)
}
