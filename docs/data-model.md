# Data model

Everything Paper Trail knows about a paper is on the paper's note. This page is
the full list of what it reads and writes there.

## What makes a note a paper

A note is a paper when its frontmatter has a string under the **item key
property** (`zotero-key` by default). Not its folder, its tags or its template.
`isPaper` in `src/core/paper-note.ts` is the one test, and everything asks it.

Two things write that property: a decision about a paper with no note, which
makes the note, and **Link existing notes to Zotero**, which writes it on
notes another plugin made and nothing else (`planAdoption` in
`src/core/adoption.ts` matches them by citation key). Its confirmation lists
the managed keys below that the first sync will replace (`replacedKeys`).

## Keys a refresh from Zotero writes

Overwritten from Zotero whenever they differ, except `aliases`, which is only
added to (`MANAGED_KEYS` in `src/core/paper-note.ts`):

| Key | Value |
| --- | --- |
| `title` | Zotero's short title, or its full title when there is none |
| `aliases` | The citation key, added only when the note is not already named for it. Aliases you add are kept |
| `authors` | Author names, comma separated |
| `year` | The year, or empty |
| `citekey` | Better BibTeX's citation key. Without Better BibTeX the key is left out, not left empty |
| `zotero` | `zotero://select/...` link to the item |
| *item key property* | The Zotero item key, with `g` and the group's id after it for a paper in a group library (`ABCD1234g5`) |

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
about the paper, and a report about you. A judgement leaves progress alone. Two
choices in the status chooser move progress back: sending a read paper back to
be read again clears it, and reopening a claim or an assessment takes it back
one step (`summarised` to `read`, `assessed` to `summarised`, the latter also
setting `reading` to `promoted`).

A `reading` value Paper Trail does not know reads as `untriaged`.

`reading-after` stores a Zotero key rather than a link because the paper you
wait for is usually unread, and from a source without triage an unread paper
has no note to link to.

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
them is the user's. The opening marker counts at the end of a line and the
closing one at the start of a line (`offsets` in `src/core/paper-note.ts`), so
one joined onto the line above or below still marks the region, and a sync puts
it back on a line of its own. A marker quoted in a sentence never counts. A
note with anything but one opening marker followed by one closing marker has a
broken region (`regionSpan`), and nothing in it is replaced, because there's
no telling which lines are the user's: a closing marker deleted by accident
leaves their prose after the opening one. The sync on open skips it silently;
**Refresh paper from Zotero** says why.

The region holds the `## Annotations` section, one block per Zotero
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

A `%%` or `<!--` in a passage or a comment would open a comment that hides
the rest of the note, so `inert` in `src/core/zotero.ts` writes the second `%`
or `-` as an HTML entity, which Obsidian and pandoc show as the character. Not
the `<`, since pandoc would make the `--` after it a dash. The title is written
through it too.

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

What a release may change in any of this is in [Compatibility](compatibility.md).
