
type Props = {
  appOptions: string[];
  allAppsSelected: boolean;
  selectedApps: Set<string>;
  onToggleApp: (name: string) => void;
  onSelectAll: () => void;
};

export function ApplicationsCard({
  appOptions,
  allAppsSelected,
  selectedApps,
  onToggleApp,
  onSelectAll
}: Props) {
  if (appOptions.length === 0) return null;

  const isSelected = (name: string) =>
    allAppsSelected ? true : selectedApps.has(name);

  return (
    <div className="bg-white rounded-lg shadow mb-6 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Applications</h2>

        {!allAppsSelected && (
          <button
            onClick={onSelectAll}
            className="text-xs text-gray-600 hover:text-gray-900 underline"
            title="Reset to show all apps"
          >
            Select all
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {appOptions.map((name) => {
          const active = isSelected(name);
          return (
            <button
              key={name}
              onClick={() => onToggleApp(name)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                active
                  ? "bg-indigo-600 text-white"
                  : "bg-indigo-100 text-indigo-800 hover:bg-indigo-200 opacity-60"
              }`}
              title={
                allAppsSelected
                  ? "Click to exclude this app"
                  : active
                    ? "Click to hide this app"
                    : "Click to show this app"
              }
            >
              {name}
            </button>
          );
        })}
      </div>

      {!allAppsSelected && selectedApps.size === 0 && (
        <div className="mt-3 text-xs text-amber-700">
          No apps selected — traces are hidden.
        </div>
      )}
    </div>
  );
}
