# Recipe: a status bar timer plugin for Orca

How this plugin was built, step by step, so you (or an agent) can make a similar one: a background
worker that keeps a status bar item up to date, plus commands, settings, notifications and a sound.
Written against Orca 1.4.251, checked again on 1.4.255.

## Ingredients

| Need                                   | Orca API                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------- |
| Code that keeps running in the background | `execution: "trusted-worker"`, `main: "src/worker.ts"`                  |
| Text in the status bar that you can click | `contributes.statusBarItems` + `orca.host.call('statusBar.update', …)`  |
| Command palette entries and a shortcut | `contributes.commands`, `contributes.keybindings`, `orca.commands.register` |
| Options in Settings → Plugins          | `contributes.settings` + `settings:own`, `orca.settings.get/onDidChange`    |
| State that survives reloads            | `storage:own`, `orca.storage.get/set`                                       |
| Desktop notification                   | `notifications:show`, `orca.host.call('notifications.show', …)`            |
| Sound                                  | `node:child_process` (`afplay` / `paplay` / PowerShell): the worker is plain Node |

A plugin with `main` and status bar items has its worker started when it's enabled and kept running
while it stays enabled, so a `setInterval` in `activate` is enough to drive the clock.

## Steps

1. **Scaffold.** `orca plugin create ./my-plugin --template hook`, the smallest worker template, then
   swap its `terminal.send` hook for what you need. Don't start the id with `orca-`; that prefix is
   reserved.
2. **Manifest.** List the capabilities, commands, keybindings, status bar items and settings
   (see `orca-plugin.json`). Set `engines.orca` to `>=1.4.248`, the version that introduced status bar items.
3. **Worker.** `export default function activate(orca)`. A named `export function activate` is never
   called. In it:
   - Register each command with `orca.commands.register(id, handler)`. A returned string is shown
     to the user.
   - Load settings and saved state, then `setInterval(tick, 1000)`.
   - In `tick`, call `statusBar.update` only when the text changes. Fields you leave out keep their value;
     `visible: false` hides an item (the reset button hides when there's nothing to reset).
   - Save the state with `orca.storage.set` on each change. A save of the worker file restarts the worker and
     clears its memory.
4. **Stop cleanly.** Export `deactivate()` and clear the interval in it. Without it,
   `orca plugin test` never exits.
5. **Test.** `mountWorker(main, { commands: [...] })` from `orca/testing`. Run the commands with
   `worker.command(id)`, then assert on `worker.host.callsOf('statusBar.update')` and
   `worker.refusals`. Run with `orca plugin test .`.
6. **Try it in Orca.** `orca plugin validate .`, then `orca plugin dev load .`. Orca prints what the
   plugin will be allowed to do and an approval fingerprint. Approve with `--approve <fingerprint>`.
   Adding commands, status bar items or capabilities later needs a new approval. Code edits don't.
   `orca plugin shot <plugin-key> --status-bar` saves a PNG of the status bar.
7. **Publish.** Push to a public GitHub repository, tag `v<version>` (matching `version` in the
   manifest), and add the `orca-plugin` topic. The repository owner becomes the publisher. The
   listing appears at `https://www.onorca.dev/plugins/<owner>/<repo>`.

## Gotchas met along the way

- In Orca 1.4.251, `orca plugin create` stopped partway with
  `ENOENT … plugins/declarative/orca.d.ts` and wrote no `.orca/types`. Fixed in 1.4.255:
  `orca plugin types .` works, and `tsc -p .` type-checks the plugin. Orca's types don't cover
  Node built-ins, so `src/node.d.ts` declares the two used here (`execFile`, `process.platform`)
  instead of pulling in `@types/node`.
- Anything in `.orca/` stops a development plugin's worker (still true in 1.4.255): approval
  skips `.orca/`, as the docs say, but the check at worker start counts it, so the worker keeps
  failing with `content hash mismatch` and no new approval clears it. Both `orca plugin types`
  (`.orca/types`) and `orca plugin shot` run inside the folder (`.orca/shots`) write there.
  Type-check, then `rm -rf .orca` before loading or enabling; pass `shot` an `--out` path outside
  the folder.
- Every other file added to the folder (screenshots, docs) changes the content hash and asks
  for approval again. Generate assets outside the folder and copy them in once.
- `notifications.show` only takes `title` and `body`; there is no sound option, hence the
  `child_process` sound.
