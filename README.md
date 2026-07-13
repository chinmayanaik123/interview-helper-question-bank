# shared-data — the single source of truth

This folder holds **all interview questions** as JSON. Both the website and the
Flutter Android app read from these exact files. Nothing else stores question
content (Firebase stores only *user* data — progress, bookmarks, notes).

## Files

- `manifest.json` — content version, timestamp, and the list of categories.
- `<category>.json` — one file per category (e.g. `angular.json`, `git.json`).

## Editing content (typo fix / new question / better answer)

1. Edit the relevant `<category>.json` (or add a new object to the array).
2. If you added/removed questions, update that category's `count` in `manifest.json`.
3. **Bump `version`** in `manifest.json` (integer +1) and update `updatedAt`.
4. Commit + push. Website and app pick it up automatically (see ARCHITECTURE.md).

> The `version` bump is what tells the Flutter app to re-download. If you forget
> it, existing app installs keep the old cached copy.

## Question schema

```jsonc
{
  "id": "git-merge-rebase",        // globally unique, stable — never reuse
  "category": "git",               // must equal the manifest category id
  "difficulty": "intermediate",    // beginner | intermediate | advanced
  "tags": ["merge", "rebase"],     // string[]
  "question": "Merge vs rebase.",  // plain text
  "answer": "<p>…</p>",            // trusted HTML (rendered as markup)
  "tip": "Don't rebase shared branches.", // optional plain text
  "code": "git rebase main",       // optional code sample ("" if none)
  "lang": "bash",                  // optional language hint ("" if none)
  "deep": "<p>…</p>"               // optional in-depth HTML (omit if absent)
}
```

## Regenerating from the legacy JS (one-off)

The JSON was generated from the old `data/*.js` files with
`node scripts/migrate-to-json.js`. That script is kept for reference only —
**JSON is now the source of truth**; do not edit `data/*.js`.
