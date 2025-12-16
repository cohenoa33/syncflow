
type Props = {
  query: string;
  setQuery: (v: string) => void;

  showSlowOnly: boolean;
  setShowSlowOnly: (v: boolean) => void;

  showErrorsOnly: boolean;
  setShowErrorsOnly: (v: boolean) => void;

  onExportJson: () => void;
  exportDisabled: boolean;

  showingCount: number;
  totalCount: number;
};

export function SearchBar({
  query,
  setQuery,
  showSlowOnly,
  setShowSlowOnly,
  showErrorsOnly,
  setShowErrorsOnly,
  onExportJson,
  exportDisabled,
  showingCount,
  totalCount
}: Props) {
  return (
    <div className="bg-white rounded-lg shadow mb-6 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search traces (route, model, payload text...)"
          className="w-full sm:flex-1 px-3 py-2 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showSlowOnly}
            onChange={(e) => setShowSlowOnly(e.target.checked)}
            className="rounded"
          />
          Slow only
        </label>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showErrorsOnly}
            onChange={(e) => setShowErrorsOnly(e.target.checked)}
            className="rounded"
          />
          Errors only
        </label>

        <button
          onClick={onExportJson}
          disabled={exportDisabled}
          className={`px-3 py-2 rounded-md text-sm font-medium transition ${
            exportDisabled
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-indigo-600 text-white hover:bg-indigo-700"
          }`}
        >
          Export JSON
        </button>

        <div className="text-xs text-gray-500">
          Showing {showingCount} / {totalCount}
        </div>
      </div>
    </div>
  );
}
