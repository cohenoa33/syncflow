import { useState } from "react";
import { API_BASE, TENANT_ID } from "../lib/config";
import { demoHeaders } from "../lib/api";
import { getDemoMode, setDemoMode, getDemoAppNames } from "../lib/demoMode";

type Props = {
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
  requiresDemoToken: boolean;
};

export function DemoModeToggle({
  onToggle,
  disabled,
  requiresDemoToken
}: Props) {
  const [demoEnabled, setDemoEnabled] = useState(getDemoMode());
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    const newValue = !demoEnabled;
    setLoading(true);

    try {
      if (newValue) {
        if (!TENANT_ID) {
          return;
        }
        // Turning ON: seed demo data
        const demoApps = getDemoAppNames(TENANT_ID);
        const res = await fetch(`${API_BASE}/api/demo-seed`, {
          method: "POST",
          headers: {
            ...demoHeaders(requiresDemoToken),
            "Content-Type": "application/json",
            "X-Demo-Request": "true"
          },
          body: JSON.stringify({ apps: demoApps })
        });

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.message || "Failed to seed demo data");
        }
      } else {
        // Turning OFF: clear demo data
        const res = await fetch(`${API_BASE}/api/demo-seed`, {
          method: "DELETE",
          headers: demoHeaders(requiresDemoToken)
        });

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.message || "Failed to clear demo data");
        }
      }

      setDemoEnabled(newValue);
      setDemoMode(newValue);
      onToggle(newValue);
    } catch (err) {
      console.error("[Dashboard] Demo mode toggle failed:", err);
      alert(
        `Failed to toggle demo mode: ${err instanceof Error ? err.message : err}`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="demo-toggle"
        className="text-sm font-medium text-gray-700"
      >
        Demo Mode
      </label>
      <button
        id="demo-toggle"
        onClick={handleToggle}
        disabled={disabled || loading}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
          demoEnabled ? "bg-indigo-600" : "bg-gray-200"
        }`}
        role="switch"
        aria-checked={demoEnabled}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            demoEnabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      {loading && <span className="text-xs text-gray-500">Loading...</span>}
    </div>
  );
}
