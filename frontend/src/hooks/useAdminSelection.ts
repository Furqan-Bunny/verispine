import { useCallback, useState } from 'react'

// Row-selection state for admin tables: per-row toggle, select-all, and clear.
export function useAdminSelection() {
  const [selected, setSelected] = useState<string[]>([])

  const toggle = useCallback((id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  // Select all `ids` — or clear if they're already all selected.
  const toggleAll = useCallback((ids: string[]) => {
    setSelected((prev) => (prev.length === ids.length && ids.length > 0 ? [] : ids))
  }, [])

  const clear = useCallback(() => setSelected([]), [])

  const isSelected = useCallback((id: string) => selected.includes(id), [selected])
  const allSelected = (ids: string[]) => ids.length > 0 && selected.length === ids.length

  return { selected, toggle, toggleAll, clear, isSelected, allSelected }
}
