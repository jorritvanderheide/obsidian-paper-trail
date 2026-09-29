# Todo

## A changed citation key breaks citations, and the alias doesn't help

When Better BibTeX gives a paper a new citation key, which happens when a key is regenerated on purpose or when its "Regenerate citation key when item changes" setting is on, a refresh updates `citekey` and adds the new key to `aliases` (`paperFrontmatter` in `src/core/paper-note.ts`). The note keeps its old name. From then on:

- Existing `[[oldkey]]` links still open the note, but drop out of an export. `pandoc/wikilink-citations.lua` only turns a link into a citation when its target is a key in the bibliography, and Better BibTeX's auto-export now writes the new key.
- New citations from **Insert citation** are `[[newkey]]`, because it takes the key from Zotero (`insertCitation` in `src/commands/citations.ts`). Those export, but don't resolve in Obsidian.

One comment assumes the alias makes `[[newkey]]` resolve: the one on `aliases` in `paperFrontmatter` ("Without this, a citation to one of those would quietly not resolve"). It doesn't. Obsidian resolves a link by file name and path only: `metadataCache.getLinkpathDest` never reads aliases (checked in Obsidian 1.13.7). An alias only puts the note in the link suggester, which then writes `[[name|alias]]`. That link's target is still the old name, so it doesn't export either.

The same goes for the case the alias was written for: a note made before Better BibTeX was installed, named by author, title and year, that learns its key later.

**Fix.** When a refresh finds that the citation key and the note's name disagree, say so, and offer to rename the note to the key through `app.fileManager.renameFile`, which moves every link along when "Automatically update internal links" is on. Offer rather than rename silently: with that setting off, a rename breaks every link, and the file is someone's own. Once names follow keys, the alias can go, and so can the comment.

Still open: where to surface it. A notice on refresh, the status pill, or a mark on the paper's row in the queue.

## The pandoc filter

- **Nothing runs it in a test.** A test holds its locator terms to `LOCATOR_LABELS` in `src/core/zotero.ts`, and that is all. Every other rule in it (grouping, locators from the label, headings, links to own notes) was checked by hand with pandoc.
- **`@key [[other]]` swallows the link.** Pandoc reads a bracket right after an in-text `@key` as that citation's locator: `As @a [[b]] argues` exports as "As A (2025[b]) argues". Not caused by the filter, but only the filter can fix it.
- **Exporter carries its own copy, and it has drifted.** `obsidian-exporter` bundles `pandoc/wikilink-citations.lua` and reads a label differently: it takes a prefix and suffix from around the key, `[[a|see a, p. 4, emphasis added]]`, and ignores a label that does not repeat the key. This one reads the page after the first comma, and Insert citation writes the prefix and suffix outside the link. `[[a|Jacobs, ch. 3]]`, which Add page to citation writes for a link that had a label, loses its chapter in Exporter. One filter, one reading of a label, and the other plugin copies it.

## Insert citation

- **Tab before the results arrive.** Tab marks the picker as wanting a page before it knows there is a suggestion to choose. Pressed while a search is still loading, it chooses nothing, and the next Enter asks for a page anyway.
