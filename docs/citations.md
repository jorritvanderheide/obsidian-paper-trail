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

The link target is the paper's note by its name, and an annotation without a
page gets the bare link, `[[a]]`. Due Credit and In the Open cite a link to a
paper note by that note's `citekey` property, so it cites whatever the note is
called:

- **With Better BibTeX** the note is named for the key, unless Better BibTeX
  changed it later, and `citekey` holds the key as it is now. A key with a
  character a note's name can't have, like `smith:2017`, names the note
  `smith-2017` (`noteName`), and `citekey` keeps the colon.
- **Without Better BibTeX** the note is named for its author, title and year,
  and has no `citekey`, so its citations export as words, and Due Credit's
  check before an export lists them.

Not a page after `#`: Obsidian reads `[[a#p. 7]]` as a heading, and its hover
preview reports the section missing.

The page is Zotero's page label, always written after `p.`, so no list of
locator words is needed here: those are Due Credit's.

## Changing the form

Both Due Credit and In the Open read a form before Paper Trail writes it, so no
note is ever written in a spelling an export or a post does not know. They read
citations through the same core, so:

1. Teach the core to read it, and tag a version.
2. Move Due Credit and In the Open to that version, and release both.
3. Then have Paper Trail write it.
