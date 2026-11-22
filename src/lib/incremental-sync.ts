// Incremental refreshes use the server's own `modified` values as the watermark.
// A browser clock watermark (ISO, UTC) is not comparable with ERPNext's
// server-local `modified` strings and silently skips same-day edits.
export function latestModified(rows: ReadonlyArray<{ modified?: unknown }>) {
  let latest: string | undefined
  for (const row of rows) {
    const value = typeof row.modified === 'string' ? row.modified : undefined
    if (value && (!latest || value > latest)) latest = value
  }
  return latest
}

// Overlays changed rows on the cached rows, keeps cached order, appends new
// rows, and drops rows that no longer exist on the server.
export function mergeIncrementalRows<T extends { name: string }>(existing: readonly T[], changed: readonly T[], liveNames: ReadonlySet<string>) {
  const changedByName = new Map(changed.map((row) => [row.name, row]))
  const merged: T[] = []
  for (const row of existing) {
    if (!liveNames.has(row.name)) continue
    const update = changedByName.get(row.name)
    merged.push(update ? { ...row, ...update } : row)
    changedByName.delete(row.name)
  }
  for (const row of changedByName.values()) if (liveNames.has(row.name)) merged.push(row)
  return merged
}
