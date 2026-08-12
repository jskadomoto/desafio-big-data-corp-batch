const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](.*))?$/

const HOUR = /^\d{2}:\d{2}(:\d{2})?(\.\d+)?([Z+-][\d:]*)?$/

const DATE_BR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

// Formata uma data no formato ISO 8601 (YYYY-MM-DD) a partir de um valor numérico, garantindo que o mês e o dia tenham dois dígitos.
const formatDateToISO = (value: number): string => String(value).padStart(2, '0')

const canonicalizeDate = (year: number, month: number, day: number): string => {
  const date = new Date(year, month - 1, day)
  date.setUTCFullYear(year)
  const isExists =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day

  return isExists
    ? `${String(year).padStart(4, '0')}-${formatDateToISO(month)}-${formatDateToISO(day)}`
    : ''
}

export const toISODateField = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  const iso = ISO.exec(value)

  if (iso !== null) {
    const hour = iso[4]
    if (hour !== undefined && typeof hour === 'string' && !HOUR.test(hour)) return ''
    return canonicalizeDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  }

  const br = DATE_BR.exec(value)
  if (br !== null) {
    return canonicalizeDate(Number(br[3]), Number(br[2]), Number(br[1]))
  }
  return ''
}
