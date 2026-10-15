import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('shadcn class utility', () => {
  it('joins conditional classes and resolves Tailwind conflicts', () => {
    expect(cn('control', undefined, 'px-4', 'px-2')).toBe('control px-2')
  })
})
