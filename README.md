# Paper Trail

[![Donate](https://liberapay.com/assets/widgets/donate.svg)](https://liberapay.com/BW20)

**Decide what to read before you read it, and keep the decision.**

You have four hundred papers and time for forty. Reference managers help you
collect and annotation tools help you read; both assume the choosing already
happened. It happens constantly, in seconds, and nothing records it, so the same
paper comes back in a search three years later and you assess it from nothing.
Then you write the chapter and have to say how the corpus was narrowed.

Paper Trail puts a decision in front of the reading and writes it down.

## The queue

Your library stays in Zotero. Paper Trail talks to it over the local API,
creates the literature note itself, and keeps one list of what is outstanding.

```
7 outstanding                            →
───────────────────────────────────────────
▾ Triage                                 3
    Reframing heat pump transitions
    Strategic Reading and Ontologies
    How to Read a Paper
▾ Read                                   1
    Scholars Before Researchers
▾ Write up                               2
▾ Assess                                 1
```

A row opens the paper; what else that stage offers appears as icons when you
hover it, and stages fold away when you are not working them.

It lives in the sidebar (ribbon icon, or **Open queue**), and **Insert queue
block** will put the same list in any note. **Next** takes the top row and does
whatever it needs.

Nothing here refuses: there is no order you have to work in and no stage that
locks until an earlier one is clear.

## The passes

The reading model is S. Keshav's *How to Read a Paper*: increasingly expensive
passes, each ending in a decision about whether to make the next one.

**Triage** is what Zotero holds that your vault has no note for. It is computed,
not stored, so importing four hundred search results gives you four hundred rows
and zero files. Nothing is written until you decide, and the decision is what
makes the note.

The pane shows the title, venue, year and abstract straight away, then the
introduction, the outline and the conclusion from the text Zotero already
extracted. It also reads the bibliography and tells you how many of those papers
you already have, with the ones you **dropped** listed first. Then: drop it and
say why, queue it, or mark it already read.

**Read** opens the paper in Zotero, where your highlights belong. When you are
done, **Finished** asks what came of it: enough, worth assessing closely, come back
later, or not worth finishing. The first two move it to **Write up** for the
claim, in your own words. Your highlights are already in the note by then.

**Assess** is for the few papers you promote, and ends when the assessment is
written. It is Keshav's third pass: arguing with a paper you can already
summarise.

## The record

A dropped paper is not a deletion. The note stays, and so do:

| | |
| --- | --- |
| `reading` | `untriaged`, `queued`, `finished`, `pass-three`, `deferred` or `dropped` |
| `reading-date` | when the status last changed |
| `triaged-date` | when you first formed an opinion, written once |
| `reading-reason` | why, on a drop or a deferral |

Nothing about Zotero overwrites those four. **Export excluded papers** turns
them into a plain markdown table, oldest first, every row linking back to the
paper, ready for an appendix.

## Your own notes

**Add note** offers any template in your template folder; two ship with it, a
plain note and a map. Nothing is stamped on what you write and nothing asks you
about it afterwards: the queue is for papers, and a note you wrote is finished
when you stop typing. **Retag note** sets a `domain/`, which is the one tag axis
Paper Trail knows, because it claims one only where the workflow reads it.

A literature note also carries two buttons in its own title bar: refresh from
Zotero, and whatever that note is waiting for.

## Safety

Paper Trail owns a fixed set of frontmatter keys (`title`, `aliases`, `authors`,
`year`, `citekey`, `zotero`, and whichever property names the Zotero item) and
one delimited region:

```
%%paper-trail%%
## Highlights

> a passage you highlighted in Zotero (p. 4) ^zt-ABCD2345
%%/paper-trail%%
```

A sync may overwrite those and nothing else. Every other key, every heading and
every word you wrote is yours. Highlight anchors come from Zotero's annotation
keys, so a link to one passage keeps resolving across re-syncs.

You never have to run a sync: a paper is refreshed when its note is created and
whenever you open it, and only written when Zotero has something different.

## Requirements

- **Zotero**, running, with *Allow other applications on this computer to
  communicate with Zotero* enabled in Settings → Advanced.
- **Better BibTeX**, optional. With it, notes are named for the citation key and
  **Insert citation** has a key to insert. Without it, notes get a readable
  author-title-year name and everything else works unchanged.
- Desktop only: it reads Zotero's storage folder from disk.

It never runs a shell command, and the only thing it talks to is Zotero on
localhost. It does not need another Zotero-to-Obsidian bridge; it creates the
literature note itself.

## Settings

Addresses, not opinions: which folders hold your notes, papers and templates,
which frontmatter property names the Zotero item, and which headings Write up
and Assess end under. Point the item key property at whatever your
existing literature notes use and they are recognised without being rewritten.

The stages and the `reading` vocabulary are not configurable. They are the
product.

## Development

```sh
nix develop     # or any Node.js 20+
npm install
npm run dev
npm test
npm run lint
```

`src/core/` is pure and holds every decision, with a test named after each file.
`src/commands/` and `src/ui/` wire that to Obsidian.

## License

[EUPL-1.2](LICENSE)
