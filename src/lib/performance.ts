/* global console */

export function markPerformance(name: string) {
  if (!import.meta.env.DEV || typeof performance === 'undefined') return
  performance.mark(name)
}

export function measurePerformance(name: string, startMark: string, endMark: string) {
  if (!import.meta.env.DEV || typeof performance === 'undefined') return
  try {
    const measure = performance.measure(name, startMark, endMark)
    console.debug(`[performance] ${name}: ${measure.duration.toFixed(1)} ms`)
  } catch {
    // Instrumentation must never affect the application.
  }
}
