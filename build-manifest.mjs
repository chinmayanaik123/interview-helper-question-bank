/* ============================================================
   build-manifest.mjs — regenerate manifest.json from the JSON files.

   You edit questions (or add a <category>.json); this recomputes the
   tedious/derived fields so you never hand-calculate them:
     • count      — per category, from the file
     • totalQuestions
     • hash       — per file (detects ANY edit, even a same-count typo fix)
     • updatedAt  — now (only when content changed)
     • version    — auto-bumped +1 ONLY when content actually changed
                    (running it with no changes is a no-op — idempotent)

   It also validates the content and fails loudly on problems.

   You still DEFINE groups/categories in manifest.json (id, file, label,
   group, color, order). This script only fills in the derived numbers.

   Usage:  node build-manifest.mjs        (or: npm run build) No need to do this mannually we have ahook to do this.
   ============================================================ */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(dir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const DIFFICULTIES = new Set(["beginner", "intermediate", "advanced"]);
const errors = [];
const seenIds = new Map(); // id -> file (to catch duplicates across files)

const groupIds = new Set((manifest.groups || []).map((g) => g.id));
let total = 0;
const combined = createHash("sha1");

for (const cat of manifest.categories) {
  let rows;
  try {
    rows = JSON.parse(readFileSync(join(dir, cat.file), "utf8"));
  } catch (e) {
    errors.push(`${cat.file}: cannot read/parse (${e.message})`);
    continue;
  }
  if (!Array.isArray(rows)) {
    errors.push(`${cat.file}: top level must be a JSON array`);
    continue;
  }

  // validate each question
  rows.forEach((q, i) => {
    const where = `${cat.file}[${i}]`;
    if (!q.id) errors.push(`${where}: missing "id"`);
    else if (seenIds.has(q.id)) errors.push(`duplicate id "${q.id}" in ${cat.file} and ${seenIds.get(q.id)}`);
    else seenIds.set(q.id, cat.file);
    if (!q.question) errors.push(`${where} (${q.id}): missing "question"`);
    if (!q.answer) errors.push(`${where} (${q.id}): missing "answer"`);
    if (q.difficulty && !DIFFICULTIES.has(q.difficulty))
      errors.push(`${where} (${q.id}): bad difficulty "${q.difficulty}"`);
    if (q.category && q.category !== cat.id)
      errors.push(`${where} (${q.id}): category "${q.category}" != "${cat.id}"`);
  });
  if (groupIds.size && !groupIds.has(cat.group))
    errors.push(`category "${cat.id}": group "${cat.group}" is not in manifest.groups`);

  // derived fields — canonicalise the file so the hash is stable
  const canonical = JSON.stringify(rows);
  cat.count = rows.length;
  cat.hash = createHash("sha1").update(canonical).digest("hex").slice(0, 12);
  combined.update(cat.file + ":" + canonical);
  total += rows.length;
}

/* ---- packs: role-focused collections of existing questions ----
   A pack (packs/<id>.json) names whole categories plus cherry-picked
   question ids. Nothing is duplicated — the webapp resolves the pack
   against the categories it already loaded. Here we only validate the
   references and derive label/count/hash into manifest.packs. */
const catIds = new Set(manifest.categories.map((c) => c.id));
const catCount = new Map(manifest.categories.map((c) => [c.id, c.count]));
for (const packRef of manifest.packs || []) {
  let pack;
  try {
    pack = JSON.parse(readFileSync(join(dir, packRef.file), "utf8"));
  } catch (e) {
    errors.push(`${packRef.file}: cannot read/parse (${e.message})`);
    continue;
  }
  if (pack.id !== packRef.id)
    errors.push(`${packRef.file}: pack id "${pack.id}" != manifest id "${packRef.id}"`);
  const packCats = pack.categories || [];
  const packCatSet = new Set(packCats);
  packCats.forEach((c) => {
    if (!catIds.has(c)) errors.push(`${packRef.file}: unknown category "${c}"`);
  });
  let picks = 0;
  (pack.questionIds || []).forEach((id) => {
    const file = seenIds.get(id);
    if (!file) { errors.push(`${packRef.file}: unknown question id "${id}"`); return; }
    const catOfId = manifest.categories.find((c) => c.file === file);
    if (catOfId && packCatSet.has(catOfId.id))
      errors.push(`${packRef.file}: id "${id}" is redundant — its category "${catOfId.id}" is already included`);
    else picks++;
  });
  packRef.label = pack.label || packRef.id;
  packRef.count = packCats.reduce((n, c) => n + (catCount.get(c) || 0), 0) + picks;
  packRef.hash = createHash("sha1").update(JSON.stringify(pack)).digest("hex").slice(0, 12);
  combined.update(packRef.file + ":" + JSON.stringify(pack));
}

if (errors.length) {
  console.error("✗ manifest NOT written — fix these first:\n  - " + errors.join("\n  - "));
  process.exit(1);
}

const contentHash = combined.digest("hex");
const changed = manifest.contentHash !== contentHash;

manifest.totalQuestions = total;
if (changed) {
  manifest.version = (manifest.version || 0) + 1;
  manifest.updatedAt = new Date().toISOString();
  manifest.contentHash = contentHash;
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(
  changed
    ? `✔ manifest v${manifest.version} — ${total} questions across ${manifest.categories.length} categories (content changed)`
    : `✔ no content change — manifest left at v${manifest.version} (${total} questions)`
);
