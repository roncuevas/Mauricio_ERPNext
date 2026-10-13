function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
}

function distance(left: string, right: string) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0]
    row[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      const above = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return row[right.length]
}

function valuesOf(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.flatMap(valuesOf)
  if (typeof value === 'object') return Object.values(value).flatMap(valuesOf)
  return [String(value)]
}

export function fuzzyMatch(query: string, values: unknown[]) {
  const tokens = normalize(query).split(/[^a-z0-9]+/).filter(Boolean)
  if (!tokens.length) return true
  const candidates = values.flatMap(valuesOf).flatMap((value) => normalize(value).split(/[^a-z0-9]+/).filter(Boolean))
  return tokens.every((token) => candidates.some((candidate) => candidate.includes(token) || token.includes(candidate) || (token.length >= 4 && distance(token, candidate) <= Math.max(1, Math.floor(token.length / 5)))))
}
