
type Props = {
  currentPage: number;
  totalGroups: number;
  pageSize: number;
  pageSizeOptions: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

export function PaginationBar({
  currentPage,
  totalGroups,
  pageSize,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalGroups / pageSize));
  const startItem = totalGroups === 0 ? 0 : currentPage * pageSize + 1;
  const endItem = Math.min((currentPage + 1) * pageSize, totalGroups);

  return (
    <div className="bg-white rounded-lg shadow mb-6 p-4 flex flex-wrap items-center gap-4 text-sm text-gray-600">
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Per page:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="px-2 py-1 rounded border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {pageSizeOptions.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      <span className="text-gray-400">|</span>

      <span className="text-gray-500">
        {startItem}–{endItem} of {totalGroups} traces
      </span>

      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 0}
          className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed"
        >
          ‹ Prev
        </button>
        <span className="whitespace-nowrap">Page {currentPage + 1} of {totalPages}</span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages - 1}
          className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
