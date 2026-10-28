# Compatibility

Paper Trail writes into notes in other people's vaults, its settings live
there too, people bind hotkeys to its commands, and Due Credit reads the
citations it writes. This page says what a release may and may not change, so
all of that keeps working across updates. Changes are listed in
[CHANGELOG.md](../CHANGELOG.md).

Paper Trail's version is `MAJOR.MINOR.PATCH`. A minor or patch release breaks
nothing below. A major release may, and the changelog then says what changed
and what to do.

## Settings

They're in the plugin's `data.json`, and `loadSettings` in
`src/core/settings.ts` reads them. It builds a fresh object out of the keys it
knows, so every save writes every key, defaults included, with `version` set to
`SETTINGS_VERSION`, which is 2.

- **Renaming a key, or changing what a value means**, is breaking unless
  `loadSettings` reads the old one and carries it over, with `SETTINGS_VERSION`
  raised. The loader goes by which keys are there rather than by the stored
  `version`. That's how version 2 came about: 1.0.0 to 1.7.0 saved one
  `collection` and one `triage` switch, and a file without `sources` becomes
  one source under **Papers from** with both (`sourcesOf`), your whole library
  when the collection is empty.
- **Adding** a key with a default isn't breaking, and neither is **removing**
  one: the loader drops keys it doesn't know.
- **Changing a default** only reaches new vaults, because a save writes the
  defaults out too: a vault from 1.0.0 still keeps its template in
  `Templates`. To change one for everyone, read the old default as the new one,
  the way `RETIRED_PROMPTS` does for the prompts 1.0.0 to 1.4.1 shipped with.
- **A value of the wrong type** reads as its default, and a source that names
  no library is dropped.
- **`retiredStatusTags`** isn't a setting but a record of the tag namespaces
  the plugin has written. Losing it leaves those tags on notes for good.
- **A test loads each release's `data.json`** (`tests/settings.test.ts`, with
  fixtures in `tests/fixtures/settings/`). When the stored shape changes, add a
  fixture saved by the last release before the change, named after it.

Going back to an older release isn't supported. 1.7.0 and older find no
`collection` in a version 2 file, so they read your whole library with triage
off, and drop **Papers from** the next time they save.

## Your notes

Everything Paper Trail reads and writes in a note is in
[Data model](data-model.md). Notes written by every release since 1.0.0 are in
people's vaults, and every later release has to read them.

- **Renaming or removing** a frontmatter key, a `reading` or
  `reading-progress` value, a word of the status tag, the region markers, the
  `^zt-<key>` block IDs or a template placeholder is breaking. It needs a
  migration that reads the old spelling, with a test that reads a note written
  before it. There's no such step yet: `stateOf` in `src/core/triage.ts` reads
  `reading` literally, and a value it doesn't know reads as `untriaged`.
- **The item key property's value** is `ABCD1234`, or `ABCD1234g5` for an item
  in group 5 (`storedKey` and `parseItemRef` in `src/core/zotero.ts`). Changing
  that format strands every paper.
- **Adding** an optional key isn't breaking. **Taking over** a key the plugin
  didn't write before is, because somebody may already use it: a key added to
  `MANAGED_KEYS` is overwritten on every refresh.
- **Inside the managed region** the format may change. The region is derived
  and is rewritten the next time a note is opened with Zotero running, which
  is how 1.6.0 added the colours. The block IDs stay, and `syncedPassages` has to read what
  `renderAnnotation` writes.
- **The status tag** is `<namespace>/<word>`, the pill's word lower-cased
  (`label` in `src/core/triage.ts`), and it's what Tag Along shows. A paper only
  gets the new word at its next decision, so renaming a word is renaming a
  value.
- **The report** is only replaced when it carries
  `paper-trail: excluded-papers`. Changing the marker makes the command refuse
  every report written before.
- **The template** `Paper.md` is never overwritten once it's there, so a change
  to the one Paper Trail seeds only reaches new vaults.

## Zotero

Paper Trail reads Zotero on port 23119 and never writes to it. The endpoints
are in [Zotero](zotero.md).

- **Zotero 7 or later** is what the README asks for. Needing a newer one for
  something that already worked is breaking.
- **Better BibTeX stays optional.** Without it a note is named for author,
  title and year. Needing it for something that worked without it is breaking.

## Commands and views

- **The plugin ID** `paper-trail` never changes. It's the plugin's folder,
  where `data.json` lives, and the start of every command ID.
- **Command IDs** are `paper-trail:open-queue`, `insert-block`, `next`,
  `refresh-paper`, `link-notes`, `excluded`, `set-reading` and
  `insert-annotation` (`src/main.ts`). `insert-citation` and `add-page` went
  to Due Credit in 2.0.0, as `due-credit:insert-citation` and
  `due-credit:add-page`. People bind hotkeys to
  them, so renaming or removing one is breaking. A command's name may change.
- **The queue's view type** `paper-trail-queue` is saved in the workspace
  layout. Renaming it breaks the pane people have open.
- **The queue block** is a `paper-trail` code block in people's notes.
  Renaming it is breaking.
- There are no `obsidian://` URIs to keep.

## Due Credit

The one citation form Paper Trail writes, in **Insert annotation**, is an
agreement with Due Credit, described in [Citations](citations.md).

- **A new form is read there first.** Due Credit is released before Paper
  Trail writes it ([Changing the form](citations.md#changing-the-form)).
- **`citekey`** is the property Due Credit cites a paper note by, by default.
  Renaming it breaks the citations of every paper.

## Obsidian

- **`minAppVersion`** is 1.13.0 for every release so far. Raising it isn't
  breaking, because `versions.json` tells an older Obsidian which release it
  can still install. So every release keeps its line there: `npm version` adds
  it, and the release workflow refuses a tag without one.
- **Desktop only** (`isDesktopOnly`), because Zotero runs on the desktop and
  `src/http.ts` uses Node's `http`. Paper notes sync to mobile as plain
  markdown.

## Not covered

These can change in any release:

- The wording of commands, notices, the settings tab and the welcome.
- How the queue, the block and the pill look, and their CSS classes.
- What the managed region holds, apart from the block IDs.
- The code in `src/`.
