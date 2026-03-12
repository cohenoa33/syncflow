import { useEffect, useRef, useState } from "react";

type Props = {
  filter: "all" | "express" | "mongoose" | "error";
  setFilter: (v: "all" | "express" | "mongoose" | "error") => void;
  filterCounts: {
    all: number;
    express: number;
    mongoose: number;
    error: number;
  };
  onClear?: () => void;
  demoMode: boolean;
};

export function TypeFilterBar({
  filter,
  setFilter,
  filterCounts,
  onClear,
  demoMode
}: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const openConfirm = () => setShowConfirm(true);

  const handleConfirm = () => {
    setShowConfirm(false);
    onClear?.();
  };

  const handleCancel = () => setShowConfirm(false);

  // Close on outside click
  useEffect(() => {
    if (!showConfirm) return;
    const onMouseDown = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        setShowConfirm(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [showConfirm]);

  // Close on Escape
  useEffect(() => {
    if (!showConfirm) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowConfirm(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showConfirm]);

  const clearLabel = demoMode ? "Replace & Generate" : "Clear";
  const question = demoMode
    ? "Replace all traces with fresh demo data?"
    : "Delete all traces? This cannot be undone.";

  return (
    <>
      {/* Centered modal overlay */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            ref={dialogRef}
            className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{clearLabel}</h2>
            <p className="text-gray-600 mb-8">{question}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancel}
                className="px-6 py-2.5 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="px-6 py-2.5 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <div className="flex gap-2 flex-wrap">
          {(["all", "express", "mongoose", "error"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === t
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {t === "all"
                ? `All (${filterCounts.all})`
                : t === "error"
                  ? `Error (${filterCounts.error})`
                  : `${t[0].toUpperCase() + t.slice(1)} (${filterCounts[t]})`}
            </button>
          ))}

          {onClear && (
            <button
              onClick={openConfirm}
              disabled={showConfirm}
              className="ml-auto px-4 py-2 rounded-lg font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {clearLabel}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
