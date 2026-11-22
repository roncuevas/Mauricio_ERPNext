/** Formats an ERPNext/ISO timestamp as a short relative age ("hace 2 h"), or undefined when it can't be parsed. */
export function relativeAge(value: string | undefined, language: string, now = Date.now()) {
  if (!value) return undefined
  const parsed = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(parsed.getTime())) return undefined
  const seconds = Math.round((parsed.getTime() - now) / 1000)
  const format = new Intl.RelativeTimeFormat(language === 'en' ? 'en-US' : 'es-MX', { numeric: 'auto' })
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [['day', 86400], ['hour', 3600], ['minute', 60]]
  for (const [unit, size] of steps) if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
  return format.format(0, 'minute')
}
