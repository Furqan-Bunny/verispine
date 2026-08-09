import { TrashIcon } from '@heroicons/react/24/outline'

interface Props {
  count: number
  onDelete: () => void
  onClear: () => void
  label?: string
}

// Selection bar shown above an admin table when one or more rows are selected.
export default function BulkDeleteBar({ count, onDelete, onClear, label = 'item' }: Props) {
  if (count === 0) return null
  return (
    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
      <span className="text-sm text-red-800 font-medium">
        {count} {label}{count > 1 ? 's' : ''} selected
      </span>
      <div className="flex gap-2">
        <button
          onClick={onClear}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white bg-white/60"
        >
          Clear
        </button>
        <button
          onClick={onDelete}
          className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-1"
        >
          <TrashIcon className="h-4 w-4" /> Delete selected
        </button>
      </div>
    </div>
  )
}
