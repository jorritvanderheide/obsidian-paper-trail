# Todo

## A changed citation key breaks citations, and the alias doesn't help

When Better BibTeX gives a paper a new citation key, which happens when a key is regenerated on purpose or when its "Regenerate citation key when item changes" setting is on, a refresh updates `citekey` and adds the new key to `aliases` (`paperFrontmatter` in `src/core/paper-note.ts`). The note keeps its old name. From then on:

- Existing `[[oldkey]]` links still open the note, but drop out of an export. `pandoc/wikilink-citations.lua` only turns a link into a citation when its target is a key in the bibliography, and Better BibTeX's auto-export now writes the new key.
- New citations from **Insert citation** are `[[newkey]]`, because it takes the key from Zotero (`insertCitation` in `src/commands/citations.ts`). Those export, but don't resolve in Obsidian.

Two comments assume the alias makes `[[newkey]]` resolve: the one on `wikilink()` ("carries it as an alias either way") and the one on `aliases` in `paperFrontmatter` ("Without this, a citation to one of those would quietly not resolve"). It doesn't. Obsidian resolves a link by file name and path only: `metadataCache.getLinkpathDest` never reads aliases (checked in Obsidian 1.13.7). An alias only puts the note in the link suggester, which then writes `[[name|alias]]`. That link's target is still the old name, so it doesn't export either.

The same goes for the case the alias was written for: a note made before Better BibTeX was installed, named by author, title and year, that learns its key later.

**Fix.** When a refresh finds that the citation key and the note's name disagree, say so, and offer to rename the note to the key through `app.fileManager.renameFile`, which moves every link along when "Automatically update internal links" is on. Offer rather than rename silently: with that setting off, a rename breaks every link, and the file is someone's own. Once names follow keys, the alias can go, and so can both comments.

Still open: where to surface it. A notice on refresh, the status pill, or a mark on the paper's row in the queue.

## Pages and grouped citations in the pandoc filter

`pandoc/wikilink-citations-next.lua` is a candidate to replace `pandoc/wikilink-citations.lua`. It adds two things, both checked with pandoc 3.7:

- **A page after `#`.** `[[key#p. 12]]` exports as `[@key, p. 12]` would. Obsidian shows it as "key > p. 12", and it is still a link to the paper, so it stays in the backlinks. The part after `#` only counts as a page when it starts with a number, `§` or a locator term (`p.`, `pp.`, `ch.`, `sec.`, `para.`, `fig.`, `vol.`, `n.`, `l.`, `ll.`, or the full words), so `[[key#Claim]]` and `[[key#^block]]` stay plain citations. A label after `|` is only what Obsidian shows.
- **Neighbouring citations share brackets.** Citations separated by spaces, a line break or one `;` become one citation, and one `\autocites` in LaTeX. A comma, words or a link to an own note keep them apart, and in-text citations (`@key`) are never merged.

What it should do, with `a` and `b` two papers in the bibliography:

| Written | Exported |
| --- | --- |
| `[[a]]` | (A 2024) |
| `[[a#p. 12]]` | (A 2024, 12) |
| `[[a#pp. 12-14]]` | (A 2024, 12–14) |
| `[[a#ch. 3]]` | (A 2024, ch. 3) |
| `[[a#p. 12\|label]]` | (A 2024, 12) |
| `[[a#Claim]]` | (A 2024) |
| `[[a#p. 12]]; [[b#p. 3]]` | (A 2024, 12; B 2025, 3) |
| `[[a#p. 12]]; [@b, p. 3]` | (A 2024, 12; B 2025, 3) |
| `[[a]], [[b]]` | (A 2024), (B 2025) |
| `[[a]] and [[b]]` | (A 2024) and (B 2025) |

Before it replaces the current filter:

- **Insert citation** asks for an optional page and writes `[[key#p. 12]]`. Typing `#` by hand opens Obsidian's heading suggestions for the paper, and picking one turns the page into a heading link.
- The README's "Citations" section documents `[[key#p. 12]]`, grouping with `;`, and not wrapping citations in your own parentheses, which would export as "((A 2024))". It currently says a bare key can't express a locator.
- The comment on `wikilink()` in `src/commands/citations.ts` says "a locator is not a thing a wikilink can say". That stops being true.
- Decide whether the filter gets a test. Nothing tests the Lua filter today.

Already there, not caused by it: pandoc reads a bracket right after an in-text `@key` as that citation's locator, so `@key [[other]]` swallows the link.
