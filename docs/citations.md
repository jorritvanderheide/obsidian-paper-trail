# Citations

A citation is a wikilink to the paper, never pandoc's `[@key]`. Paper Trail
writes it, and [Due Credit](https://github.com/jorritvanderheide/obsidian-due-credit)
reads it on export. The forms are a contract between the two. This page is the
side that writes; Due Credit's
[`docs/citations.md`](https://github.com/jorritvanderheide/obsidian-due-credit/blob/main/docs/citations.md)
is the side that reads, with every form it accepts.

## Forms

Everything pandoc would put around the key goes in the label, around the name.

| Pandoc | Paper Trail writes |
| --- | --- |
| `[@a]` | `[[a]]` |
| `[@a, p. 4]` | `[[a\|a, p. 4]]` |
| `[see @a, p. 4]` | `[[a\|see a, p. 4]]` |
| `[-@a, p. 4]` | `[[a\|-a, p. 4]]` |
| `[@a, p. 4; @b]` | `[[a\|a, p. 4]]; [[b]]` |

The `-` against the name is Better BibTeX's `suppressAuthor`.

Not a page after `#`: Obsidian reads `[[a#p. 4]]` as a heading, and its hover
preview reports the section missing.

The link target is the paper's note by its name when there is one, which is the
citation key unless Better BibTeX changed it later. Without a note, the key.
Due Credit cites a link to a paper note by that note's `citekey` property, so a
renamed key still resolves.

## Locators

`LOCATOR_TERMS` in `src/core/zotero.ts` is the list of words that start a
locator: Better BibTeX's abbreviations, their plurals, and the full words. A
number or `§` also starts one. Due Credit's pandoc filter is Lua and keeps its
own copy of the list, by hand. A term only one side knows is a page the export
drops.

## Changing a form

Due Credit reads a form before Paper Trail writes it. That is the order for any
new form, so no note is ever written in a spelling the export does not know:

1. Teach Due Credit's filter to read it, and release.
2. Then have Paper Trail write it.

A change to `LOCATOR_TERMS` is a change to both repositories.
