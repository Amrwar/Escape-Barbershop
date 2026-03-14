interface PaginationProps {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}

export function Pagination({ page, totalPages, onPage }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 pt-4">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        ←
      </button>
      <span className="text-sm text-gray-600">
        {page} / {totalPages}
      </span>
      <button
        onClick={() => onPage(page + 1)}
        disabled={page === totalPages}
        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        →
      </button>
    </div>
  );
}
