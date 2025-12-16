export function buildAppOptions(fromAgents: string[], fromEvents: string[]) {
  const merged = Array.from(
    new Set([...fromAgents, ...fromEvents].filter(Boolean))
  );
  merged.sort((a, b) => a.localeCompare(b));
  return merged;
}

export function isAppSelected(
  name: string,
  allAppsSelected: boolean,
  selectedApps: Set<string>
) {
  return allAppsSelected ? true : selectedApps.has(name);
}
