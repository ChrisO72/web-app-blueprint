import { useId } from "react";
import { Link, useSearchParams } from "react-router";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  limit: number;
  pageSizeOptions?: number[];
}

const DEFAULT_PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

function getPageNumbers(currentPage: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis")[] = [];

  // Always show first page
  pages.push(1);

  if (currentPage <= 3) {
    // Near the start: 1, 2, 3, 4, ..., last
    pages.push(2, 3, 4, "ellipsis", totalPages);
  } else if (currentPage >= totalPages - 2) {
    // Near the end: 1, ..., last-3, last-2, last-1, last
    pages.push("ellipsis", totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
  } else {
    // In the middle: 1, ..., current-1, current, current+1, ..., last
    pages.push("ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages);
  }

  return pages;
}

export function Pagination({
  currentPage,
  totalPages,
  totalCount,
  limit,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: PaginationProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const pageSizeId = useId();

  const buildPageUrl = (page: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", page.toString());
    return `?${params.toString()}`;
  };

  const handlePageSizeChange = (newSize: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("pageSize", newSize.toString());
    params.set("page", "1"); // Reset to first page when changing page size
    setSearchParams(params);
  };

  if (totalPages <= 1 && pageSizeOptions.length <= 1) return null;

  const startItem = totalCount === 0 ? 0 : (currentPage - 1) * limit + 1;
  const endItem = Math.min(currentPage * limit, totalCount);
  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t border-zinc-200 pt-6 text-sm dark:border-zinc-800">
      <p className="text-zinc-500 dark:text-zinc-400">
        {startItem}–{endItem} of {totalCount} results
      </p>
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <label htmlFor={pageSizeId} className="text-zinc-500 dark:text-zinc-400">
            Per page
          </label>
          <select
            id={pageSizeId}
            value={limit}
            onChange={(event) => handlePageSizeChange(Number(event.target.value))}
            className="rounded-md border border-zinc-200 bg-transparent px-2 py-2 dark:border-zinc-700"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size} className="bg-white dark:bg-zinc-900">
                {size}
              </option>
            ))}
          </select>
        </div>
        {totalPages > 1 && (
          <nav aria-label="Pagination" className="flex items-center gap-1">
            {currentPage > 1 ? (
              <Link
                to={buildPageUrl(currentPage - 1)}
                className="nav-link px-2"
                aria-label="Previous page"
              >
                ← Previous
              </Link>
            ) : (
              <span aria-disabled="true" className="px-2 text-zinc-400 dark:text-zinc-600">
                ← Previous
              </span>
            )}
            <div className="hidden items-center sm:flex">
              {pageNumbers.map((page, index) =>
                page === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} className="px-2 text-zinc-400">
                    …
                  </span>
                ) : (
                  <Link
                    key={page}
                    to={buildPageUrl(page)}
                    aria-label={`Page ${page}`}
                    aria-current={page === currentPage ? "page" : undefined}
                    className="nav-link min-w-9 justify-center px-2 aria-[current=page]:underline aria-[current=page]:underline-offset-4"
                  >
                    {page}
                  </Link>
                ),
              )}
            </div>
            <span className="px-2 text-zinc-500 sm:hidden">
              {currentPage} / {totalPages}
            </span>
            {currentPage < totalPages ? (
              <Link
                to={buildPageUrl(currentPage + 1)}
                className="nav-link px-2"
                aria-label="Next page"
              >
                Next →
              </Link>
            ) : (
              <span aria-disabled="true" className="px-2 text-zinc-400 dark:text-zinc-600">
                Next →
              </span>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
