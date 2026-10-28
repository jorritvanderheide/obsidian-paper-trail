# Citations

A citation is a wikilink to the paper, never pandoc's `[@key]`.
[Due Credit](https://github.com/jorritvanderheide/obsidian-due-credit) inserts
them, with **Insert citation** and **Add page to citation**, which were Paper
Trail's until 2.0.0, and reads them on export. Its
[`docs/citations.md`](https://github.com/jorritvanderheide/obsidian-due-credit/blob/main/docs/citations.md)
has every form it reads and writes.

## The form Paper Trail writes

One, in **Insert annotation**: a quote with a citation to its page, the page
in the label, around the name.

```markdown
> In offline interactions, heuristics help individuals judge. [[a|a, p. 7]]
```

The link target is the paper's note by its name, which is the citation key
unless Better BibTeX changed it later. Due Credit cites a link to a paper note
by that note's `citekey` property, so a renamed key still resolves. Not a page
after `#`: Obsidian reads `[[a#p. 7]]` as a heading, and its hover preview
reports the section missing.

The page is Zotero's page label, always written after `p.`, so no list of
locator words is needed here: those are Due Credit's.

## Changing the form

Due Credit reads a form before Paper Trail writes it, so no note is ever
written in a spelling the export does not know:

1. Teach Due Credit to read it, and release.
2. Then have Paper Trail write it.
