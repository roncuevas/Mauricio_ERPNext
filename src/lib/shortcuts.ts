function isApple() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
}

/** Label for a Ctrl/⌘ shortcut, matching the modifier the platform uses. */
export function shortcutLabel(key: string) {
  return isApple() ? `⌘${key}` : `Ctrl+${key}`
}

/** Next bill denominations above the total, for one-tap cash entry. */
export function quickCashAmounts(total: number, denominations = [20, 50, 100, 200, 500, 1000], count = 3) {
  return denominations.filter((value) => value > total).slice(0, count)
}
