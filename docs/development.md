# Development

## Setup

```sh
nix develop     # or any Node.js 20+
npm install
npm run dev     # build in watch mode
```

To try it in a vault, link or copy `main.js`, `manifest.json` and `styles.css`
into `.obsidian/plugins/paper-trail/` and reload Obsidian. Zotero 7 has to be
running with its local API on.

## Checks

```sh
npm test        # vitest
npm run lint    # eslint, with the Obsidian plugin's rules
npm run build   # type check and production build
```

CI runs all three on Node 20, 22 and 24 for every push
(`.github/workflows/lint.yml`).

## Tests

Tests are in `tests/`, one per file in `src/core/`, named after it, plus
`source.test.ts` and `library.test.ts` with Zotero mocked. See
[Architecture](architecture.md) for why nothing else has one.

Anything that could lose a user's text wants a test before it wants a feature.

## Releasing

1. Bump the version: `npm version <x.y.z>` updates `manifest.json` and
   `versions.json`.
2. Push the commit and a tag named for the version, without a `v`.
3. `.github/workflows/release.yml` builds the tag, attests `main.js` and
   `styles.css`, and creates a **draft** GitHub release with them attached.
4. Publish the draft. Obsidian's community directory installs from GitHub
   releases, and a tag alone is not one.

Before releasing anything that renames or removes a stored key, value or marker,
see [Compatibility](data-model.md#compatibility).
