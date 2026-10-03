# Data model

Everything Paper Trail knows about a paper is on the paper's note. This page is
the full list of what it reads and writes there.

## What makes a note a paper

A note is a paper when its frontmatter has a string under the **item key
property** (`zotero-key` by default). Not its folder, its tags or its template.
`isPaper` in `src/core/paper-note.ts` is the one test, and everything asks it.

## Keys a refresh from Zotero writes

Overwritten from Zotero whenever they differ (`MANAGED_KEYS` in
`src/core/paper-note.ts`):

| Key | Value |
| --- | --- |
| `title` | Zotero's short title, or its full title when there is none |
| `aliases` | The citation key, only when the note is not already named for it |
| `authors` | Author names, comma separated |
| `year` | The year, or empty |
| `citekey` | Better BibTeX's citation key, or empty without it |
| `zotero` | `zotero://select/...` link to the item |
| *item key property* | The Zotero item key |

## Keys a decision writes

Written only by a decision made in Paper Trail (`writeTriage`). A refresh from
Zotero never touches them.

| Key | Value |
| --- | --- |
| `reading` | What the paper earns: `untriaged`, `queued`, `promoted`, `deferred`, `dropped` |
| `reading-progress` | How far you got: `read`, `summarised`, `assessed`, or absent |
| `reading-date` | When the status last changed |
| `triaged-date` | When the first decision was made. Written once |
| `reading-reason` | Why, on a drop or a deferral. Removed by any other decision |
| `reading-until` | On a deferral, the date it comes back. Removed by any other decision |
| `reading-after` | On a deferral, the Zotero key of the paper it waits for. Removed by any other decision |

`reading` and `reading-progress` are two different kinds of fact: a judgement
about the paper, and a report about you. A judgement leaves progress alone. The
one decision that clears progress is sending a read paper back to be read again.

A `reading` value Paper Trail does not know reads as `untriaged`.

`reading-after` stores a Zotero key rather than a link because the paper you
wait for is usually unread, and with triage off an unread paper has no note to
link to.

A deferral that has come back is worked out on every draw (`markDue` in
`src/core/stages.ts`) and writes nothing. Its note keeps saying `deferred` until
the next decision.

## The status tag

When **Status tag** is set to a namespace, each decision also writes one tag
under it: the word the pill shows, lower-cased, such as `status/queued` or
`status/summarised`. Changing the namespace takes the old tags off at the next
decision (`retiredStatusTags` in settings). This is the only tag Paper Trail
writes. Every other tag on a note belongs to whoever put it there.

## The managed region

```markdown
<!--paper-trail-->
...
<!--/paper-trail-->
```

Everything between the two markers is replaced on a refresh. Everything outside
them is the user's. It holds the `## Annotations` section, one block per Zotero
annotation, each ending in a block ID derived from the annotation's key
(`^zt-<key>`) so a link to it survives refreshes.

A passage in one of the eight colours of Zotero's reader is a quote callout
with the colour's name as its metadata, `> [!quote|zotero-yellow]`, and
`styles.css` draws each in its colour with the title hidden. The names are
`ANNOTATION_COLORS` in `src/core/zotero.ts`, and a test checks that
`styles.css` has a rule for each. A passage in any other colour is a plain
quote. Changing the format rewrites the region the next time a note is opened,
which is safe because the region is derived, as long as the block ID stays the
same.

**Insert annotation** reads the quote lines back (`syncedPassages` in
`src/core/paper-note.ts`): the passage, ` (p. <label>)` when there is a page,
and the block ID. A change to that line in `renderAnnotation` is a change to
both, and a test writes a region and reads it back to keep them together.

## Headings

The Claim and Assessment headings (names from settings) are written in above the
region when a paper comes to need them, one at a time. They are not in the
template. The prompts under them are drawn by an editor extension and written
into no file.

## The template

`Paper.md` in the template folder. Placeholders are `{{title}}` and `{{links}}`,
read case- and space-insensitively. An unknown placeholder is left as written.
A template without the region markers still works: the region is added at the
end of the note.

## The report

`Excluded papers.md` at the vault root carries `paper-trail: excluded-papers` in
its frontmatter. `isReport` in `src/core/record.ts` checks for it before the
file is overwritten, and a file at that path without it is refused.

## Compatibility

1.0.0 shipped on 2026-09-23, and notes written by a released version exist in
other people's vaults. So:

- **Renaming or removing** a frontmatter key, a `reading` or `reading-progress`
  value, or the region markers is a breaking change and needs a migration.
- **Adding** a new optional key is not.
- Settings carry `SETTINGS_VERSION` in `src/core/settings.ts` for migrating
  their own shape.
