import Pagination from '../Pagination'

interface Props {
  total: number
  start: number
  end: number
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  /** Noun for the summary, e.g. "order", "product". Defaults to "item". */
  label?: string
}

/**
 * Consistent admin list footer: "Showing X–Y of Z" on the left + the shared <Pagination> control
 * on the right. Renders nothing when the list is empty.
 */
export default function PaginationBar({ total, start, end, currentPage, totalPages, onPageChange, label = 'item' }: Props) {
  if (total === 0) return null
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
      <p className="text-sm text-gray-600">
        Showing <span className="font-medium">{start}</span>–<span className="font-medium">{end}</span> of{' '}
        <span className="font-medium">{total}</span> {label}{total === 1 ? '' : 's'}
      </p>
      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  )
}
