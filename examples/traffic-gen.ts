/**
 * SyncFlow Traffic Generator
 *
 * Fires realistic HTTP requests against a running example app to generate
 * varied, interesting traces on the SyncFlow dashboard.
 *
 * Usage:
 *   npx tsx examples/traffic-gen.ts
 *   npx tsx examples/traffic-gen.ts --continuous
 *   npx tsx examples/traffic-gen.ts --continuous --interval=20
 *   BASE_URL=http://localhost:4001 npx tsx examples/traffic-gen.ts --continuous
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4000";
const args = process.argv.slice(2);
const continuous = args.includes("--continuous");
const intervalArg = args.find((a) => a.startsWith("--interval="));
const intervalSec = intervalArg ? parseInt(intervalArg.split("=")[1], 10) : 20;

const NAMES = [
  "Alice Chen", "Bob Martinez", "Carol Johnson", "David Kim",
  "Elena Petrov", "Frank Okafor", "Grace Liu", "Henry Walker",
  "Isabelle Dupont", "James Osei", "Keiko Nakamura", "Luca Rossi",
  "Maya Patel", "Nour Hassan", "Oscar Silva",
];

const DOMAINS = ["example.com", "test.io", "demo.dev", "mail.net", "sample.org"];

/** Random int in [min, max] */
function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random item from array */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Sleep for ms milliseconds */
function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** Sleep a random amount between min and max ms */
function jitter(minMs: number, maxMs: number) {
  return sleep(rand(minMs, maxMs));
}

/** Generate a random valid-looking MongoDB ObjectId (24 hex chars) */
function fakeObjectId() {
  return Array.from({ length: 24 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function get(path: string) {
  const res = await fetch(`${BASE_URL}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function put(path: string, body: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function del(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, { method: "DELETE" });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function log(label: string, status: number, detail?: string) {
  const icon = status >= 500 ? "💥" : status >= 400 ? "⚠️ " : "✓ ";
  const line = `  ${icon} [${status}] ${label}`;
  console.log(detail ? `${line} — ${detail}` : line);
}

async function runScenario() {
  const run = Date.now();
  console.log(`\n[traffic-gen] Running scenario at ${new Date().toISOString()}`);

  // ── 1. Create users with unique emails ────────────────────────────────────
  console.log("\n  Creating users...");
  const createdIds: string[] = [];
  const count = rand(3, 7);

  for (const name of NAMES.slice(0, count)) {
    await jitter(50, 300);
    const slug = name.split(" ")[0].toLowerCase();
    const email = `${slug}.${run}@${pick(DOMAINS)}`;
    const r = await post("/api/users", { name, email });
    log(`POST /api/users (${name})`, r.status, r.body?._id ?? r.body?.error);
    if (r.body?._id) createdIds.push(r.body._id);
  }

  // ── 2. List all users ─────────────────────────────────────────────────────
  console.log("\n  Reading users...");
  await jitter(100, 500);
  const listR = await get("/api/users");
  log("GET /api/users", listR.status, `${listR.body?.length ?? 0} users`);

  // ── 3. Fetch individual users (random subset, random order) ───────────────
  const toFetch = [...createdIds].sort(() => Math.random() - 0.5).slice(0, rand(1, Math.min(4, createdIds.length)));
  for (const id of toFetch) {
    await jitter(80, 400);
    const r = await get(`/api/users/${id}`);
    log(`GET /api/users/${id.slice(-6)}`, r.status, r.body?.name);
  }

  // ── 4. Update random users ────────────────────────────────────────────────
  console.log("\n  Updating users...");
  const toUpdate = [...createdIds].sort(() => Math.random() - 0.5).slice(0, rand(1, 3));
  for (const id of toUpdate) {
    await jitter(100, 350);
    const newName = pick(NAMES) + " (edited)";
    const r = await put(`/api/users/${id}`, { name: newName });
    log(`PUT /api/users/${id.slice(-6)}`, r.status, r.body?.name ?? r.body?.error);
  }

  // ── 5. Error cases ────────────────────────────────────────────────────────
  console.log("\n  Triggering error traces...");

  // 5a. Missing required field
  await jitter(50, 200);
  const missingFieldR = await post("/api/users", { name: "No Email User" });
  log("POST /api/users (missing email)", missingFieldR.status, missingFieldR.body?.error?.slice(0, 70));

  // 5b. Duplicate email
  await jitter(50, 150);
  const dupEmail = `dup.${run}@${pick(DOMAINS)}`;
  await post("/api/users", { name: "First User", email: dupEmail });
  await jitter(30, 120);
  const dupR = await post("/api/users", { name: "Duplicate User", email: dupEmail });
  log("POST /api/users (duplicate email)", dupR.status, dupR.body?.error?.slice(0, 70));

  // 5c. Invalid ObjectId format — always a CastError
  await jitter(50, 200);
  const badIds = ["not-valid", "abc", "123xyz", "!!!", "null"];
  const badId = pick(badIds);
  const badR = await get(`/api/users/${badId}`);
  log(`GET /api/users/${badId} (invalid id)`, badR.status, badR.body?.error?.slice(0, 60));

  // 5d. Valid-format IDs that don't exist (diverse hex, not "666...")
  const fakeCount = rand(1, 3);
  for (let i = 0; i < fakeCount; i++) {
    await jitter(50, 250);
    const fakeId = fakeObjectId();
    const r = await get(`/api/users/${fakeId}`);
    log(`GET /api/users/${fakeId.slice(-6)} (not found)`, r.status);
  }

  // 5e. Delete non-existent user
  await jitter(50, 200);
  const ghostId = fakeObjectId();
  const ghostR = await del(`/api/users/${ghostId}`);
  log(`DELETE /api/users/${ghostId.slice(-6)} (not found)`, ghostR.status);

  // 5f. Update non-existent user
  await jitter(50, 200);
  const phantomId = fakeObjectId();
  const phantomR = await put(`/api/users/${phantomId}`, { name: "Ghost" });
  log(`PUT /api/users/${phantomId.slice(-6)} (not found)`, phantomR.status);

  // ── 6. Slow operations (will appear as warn-level in SyncFlow) ───────────
  console.log("\n  Slow operations (expect 600ms–2500ms each)...");

  // Regex search with artificial server-side delay
  const searchTerms = [pick(["a", "e", "o"]), pick(["alice", "bob", "carol", "bulk", "@"])];
  for (const term of searchTerms) {
    const r = await get(`/api/users/search?q=${encodeURIComponent(term)}`);
    log(`GET /api/users/search?q=${term}`, r.status, `${r.body?.length ?? "?"} results`);
  }

  // Stats — multiple sequential DB ops + delay
  const statsR = await get("/api/users/stats");
  log("GET /api/users/stats", statsR.status, `total=${statsR.body?.total ?? "?"}`);

  // Heavy export — longest delay
  const exportR = await get("/api/users/export");
  log("GET /api/users/export", exportR.status, `exported=${exportR.body?.exported ?? "?"}`);

  // ── 7. Burst reads with timing variance ───────────────────────────────────
  console.log("\n  Burst reads...");
  const burstCount = rand(3, 7);
  await Promise.all(
    Array.from({ length: burstCount }, async (_, i) => {
      await sleep(i * rand(10, 80)); // staggered, not simultaneous
      const r = await get("/api/users");
      log("GET /api/users", r.status, `${r.body?.length ?? "?"} users`);
    })
  );

  // ── 7. Delete some users ──────────────────────────────────────────────────
  console.log("\n  Deleting users...");
  const toDelete = [...createdIds].sort(() => Math.random() - 0.5).slice(0, rand(1, Math.min(3, createdIds.length)));
  for (const id of toDelete) {
    await jitter(80, 300);
    const r = await del(`/api/users/${id}`);
    log(`DELETE /api/users/${id.slice(-6)}`, r.status, r.body?.message ?? r.body?.error);
  }

  console.log("\n[traffic-gen] Scenario complete.\n");
}

async function main() {
  try {
    await get("/");
  } catch {
    console.error(
      `[traffic-gen] Cannot reach ${BASE_URL} — is the example app running?\n` +
        `  cd examples/mern-sample-app && pnpm dev`
    );
    process.exit(1);
  }

  await runScenario();

  if (continuous) {
    const loop = async () => {
      // Vary the interval ±30% each cycle so runs don't feel mechanical
      const jitteredMs = intervalSec * 1000 * (0.7 + Math.random() * 0.6);
      console.log(
        `[traffic-gen] Next run in ${(jitteredMs / 1000).toFixed(1)}s. Ctrl+C to stop.`
      );
      await sleep(jitteredMs);
      await runScenario();
      loop();
    };
    loop();
  }
}

main().catch((err) => {
  console.error("[traffic-gen] Fatal error:", err);
  process.exit(1);
});
