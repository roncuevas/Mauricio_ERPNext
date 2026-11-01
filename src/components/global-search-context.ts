import { createContext, useContext } from 'react'

export const GlobalSearchContext = createContext<(() => void) | null>(null)

export function useGlobalSearch() {
  return useContext(GlobalSearchContext)
}
