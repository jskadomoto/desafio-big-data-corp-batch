const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](.*))?$/

const HOUR = /^\d{2}:\d{2}(:\d{2})?(\.\d+)?([Z+-][\d:]*)?$/

const DATE_BR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const pad = (value: number, width: number): string => String(value).padStart(width, '0')

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)

const daysInMonth = (year: number, month: number): number =>
  month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month - 1] ?? 0)

const canonicalizeDate = (year: number, month: number, day: number): string =>
  day >= 1 && day <= daysInMonth(year, month)
    ? `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`
    : ''

export const toISODateField = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  const iso = ISO.exec(value)
  if (iso !== null) {
    const hour = iso[4]
    if (hour !== undefined && !HOUR.test(hour)) return ''
    return canonicalizeDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  }

  const br = DATE_BR.exec(value)
  if (br !== null) {
    return canonicalizeDate(Number(br[3]), Number(br[2]), Number(br[1]))
  }
  return ''
}
