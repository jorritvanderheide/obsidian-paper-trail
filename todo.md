# Todo

## With Due Credit

- **Drop the copy of the filter.** `pandoc/wikilink-citations.lua` is Due Credit's, copied verbatim so pandoc can be run by hand. Once Due Credit is released, delete it here and point the README's Citations section at Due Credit. The `LOCATOR_TERMS` test then reads Due Credit's copy, or goes.
- **Leaving the author out.** Better BibTeX's dialog can set `suppressAuthor`, which pandoc writes as `[-@key]`, and `citation` ignores it. Agree on a form with Due Credit, such as `[[a|-a, p. 4]]`, before either side writes or reads it.
