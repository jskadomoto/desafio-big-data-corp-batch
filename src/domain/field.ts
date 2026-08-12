export const toTextField = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value.toString()
  return ''
}

export const joinColors = (value: unknown): string => {
  if (!Array.isArray(value)) return ''
  return value
    .filter((color): color is string => typeof color === 'string' && color.length > 0)
    .join('|')
}
