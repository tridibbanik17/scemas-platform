import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const PAGE_SIZE_OPTIONS = [5, 10, 20] as const
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number]

type SettingsState = {
  pageSize: PageSizeOption
  setPageSize: (size: PageSizeOption) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    set => ({
      pageSize: 5,
      setPageSize: size => set({ pageSize: size }),
    }),
    { name: 'scemas-settings' },
  ),
)

export function usePageSize(): PageSizeOption {
  return useSettings(s => s.pageSize)
}
