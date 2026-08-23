# Camel Case Spellcheck

Camel Case Spellcheck is a desktop-only Obsidian plugin that checks the words
inside `camelCase`, `PascalCase`, and `snake_case` identifiers independently.

Obsidian normally treats a complete identifier as one spelling token. This
plugin splits compound identifiers at case and underscore boundaries and
underlines only the component that appears to be misspelled.

| Text | Result |
| --- | --- |
| `TheseAreAllWords` | No underline |
| `TheLastWordIsMispleled` | Only `Mispleled` is underlined |
| `theLastWordIsMispleled` | Only `Mispleled` is underlined |
| `the_last_word_is_mispleled` | Only `mispleled` is underlined |
| `parseHTTPResponse` | Checked as `parse`, `HTTP`, and `Response` |
| `Mispleled` | Left to Obsidian's native spellchecker |

## Features

- Checks components of camel case, Pascal case, snake case, acronyms, mixed
  styles, and identifiers with numeric boundaries.
- Uses a bundled US English Hunspell-compatible dictionary, so checking is
  local and works offline.
- Waits briefly after an edit before displaying a new underline, matching the
  less distracting behavior of native spellcheck.
- Places suggestions at the top of Obsidian's editor context menu and supports
  replacing only the misspelled component.
- Reads words already learned by Obsidian and writes **Add to dictionary**
  choices back to the same persistent desktop dictionary.
- Checks only visible editor content and skips code, comments, frontmatter,
  HTML, URLs, autolinks, and Markdown link syntax.

## Requirements and limitations

- Obsidian 1.13.6 or newer on Windows, macOS, or Linux.
- Obsidian's **Spellcheck** setting must be enabled.
- Mobile is not supported because dictionary synchronization requires Electron.
- The bundled base dictionary currently supports US English only. Changing
  Obsidian's spellcheck language does not change the plugin's base dictionary.
- Camel Case Spellcheck operates in the Markdown editor, not Reading view.
- Obsidian's persistent dictionary is accessed through an Electron session
  bridge rather than the documented Obsidian plugin API. Component checking
  continues to work if that bridge changes, but dictionary synchronization and
  **Add to dictionary** may become unavailable.

## Installation

### Community plugins

Once Camel Case Spellcheck is available in the Obsidian Community directory:

1. Open **Settings → Community plugins**.
2. Select **Browse** and search for **Camel Case Spellcheck**.
3. Select **Install**, then **Enable**.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub
   release.
2. Create `<vault>/.obsidian/plugins/camel-case-spellcheck/`.
3. Copy the three downloaded files into that folder.
4. Reload Obsidian and enable **Camel Case Spellcheck** under Community plugins.

## Usage

Write camel-case, Pascal-case, or snake-case text normally. After a short pause,
any misspelled component receives a red wavy underline. Right-click that
component to replace it with a suggestion or add it to Obsidian's dictionary.

Ordinary words are deliberately left alone, so Obsidian's native spellchecker
continues to handle them.

## Why the plugin uses its own checker

The first implementation attempted to reuse Chromium's native spellchecker for
each component. In the live Obsidian renderer, however, the exposed Electron
query reported a known misspelling as accepted and returned no suggestions even
while Obsidian visibly underlined the same word. The query API was therefore not
connected to the useful spelling context used by the editor.

A second experiment inserted invisible CodeMirror boundary widgets between the
parts of an identifier. Those widgets are decorations rather than editable
document text, and Chromium continued to combine the surrounding text into one
spelling token. The result was still a whole-identifier underline.

The current implementation takes the reliable route: it calculates component
ranges itself, suppresses native spellcheck only for the compound identifier,
checks each part with `nspell`, and adds a CodeMirror decoration around only the
misspelled range. Native spellcheck remains responsible for ordinary words.

## Privacy

Camel Case Spellcheck has no telemetry, network requests, accounts, or external
services. Text examined by the checker stays in memory and is not transmitted or
persisted by the plugin. The only persistent data it accesses is Electron's
spelling dictionary when synchronizing or adding custom words.

## Development

This repository requires Node.js 22.13 or newer.

```sh
npm ci
npm run check
```

`npm run check` runs ESLint, the unit tests, TypeScript type checking, and a
production build. Use `npm run dev` for a watch build during development. Both
commands generate `main.js`; the generated bundle is intentionally ignored by
Git and is distributed through GitHub releases instead.

To test a build, copy `main.js`, `manifest.json`, and `styles.css` into a folder
named `camel-case-spellcheck` under a disposable vault's
`.obsidian/plugins/` directory.

## Releasing

The included GitHub Actions workflow builds a draft release whenever a version
tag is pushed. To prepare a release:

1. Run `npm version patch`, `npm version minor`, or `npm version major`.
2. Push the generated commit and version tag.
3. Review the draft GitHub release and publish it.

The tag, `package.json`, `manifest.json`, and `versions.json` must use the same
semantic version. GitHub release assets must include `main.js`, `manifest.json`,
and `styles.css`. See Obsidian's
[plugin submission guide](https://docs.obsidian.md/plugins/releasing/submit-plugin)
for the initial Community directory submission.

## License and acknowledgements

Camel Case Spellcheck is released under the [MIT License](./LICENSE).

Spellchecking uses [`nspell`](https://github.com/wooorm/nspell) and the
[`dictionary-en`](https://github.com/wooorm/dictionaries/tree/main/dictionaries/en)
US English dictionary. The `nspell` dependency uses
[`is-buffer`](https://github.com/feross/is-buffer). Their license notices are
preserved in the generated plugin bundle.
