// Escape regex metacharacters so user-supplied search strings can be
// safely used inside a MongoDB { $regex } query without being interpreted
// as a pattern (prevents malformed-regex errors and ReDoS).
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
