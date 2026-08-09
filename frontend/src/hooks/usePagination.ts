import { useState, useEffect, useMemo } from 'react'

interface UsePaginationProps<T> {
  data: T[]
  itemsPerPage?: number
  resetPageOn?: any[]
}

export const usePagination = <T>({
  data,
  itemsPerPage = 10,
  resetPageOn = []
}: UsePaginationProps<T>) => {
  const [currentPage, setCurrentPage] = useState(1)

  // Reset page when dependencies change
  useEffect(() => {
    setCurrentPage(1)
  }, resetPageOn)

  const paginationData = useMemo(() => {
    const totalPages = Math.ceil(data.length / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    const paginatedItems = data.slice(startIndex, endIndex)

    return {
      currentPage,
      totalPages,
      totalItems: data.length,
      paginatedItems,
      startIndex: startIndex + 1,
      endIndex: Math.min(endIndex, data.length),
      hasNextPage: currentPage < totalPages,
      hasPreviousPage: currentPage > 1
    }
  }, [data, currentPage, itemsPerPage])

  const goToPage = (page: number) => {
    if (page >= 1 && page <= paginationData.totalPages) {
      setCurrentPage(page)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const nextPage = () => {
    if (paginationData.hasNextPage) {
      goToPage(currentPage + 1)
    }
  }

  const previousPage = () => {
    if (paginationData.hasPreviousPage) {
      goToPage(currentPage - 1)
    }
  }

  return {
    ...paginationData,
    setCurrentPage: goToPage,
    nextPage,
    previousPage
  }
}

export default usePagination