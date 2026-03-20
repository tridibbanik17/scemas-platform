'use client'

import { Button } from '@/components/ui/button'

type ListPaginationProps = {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}

export function ListPagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: ListPaginationProps) {
  const start = page * pageSize + 1
  const end = Math.min((page + 1) * pageSize, totalItems)
  const singlePage = totalPages <= 1

  return (
    <div className="flex items-center justify-between border-t border-border/30 px-4 py-2.5">
      <p className="text-xs text-muted-foreground tabular-nums">
        {start}&ndash;{end} of {totalItems}
      </p>
      {singlePage ? null : (
        <div className="flex gap-1">
          <Button
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
            size="sm"
            variant="outline"
          >
            previous
          </Button>
          <Button
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(page + 1)}
            size="sm"
            variant="outline"
          >
            next
          </Button>
        </div>
      )}
    </div>
  )
}
