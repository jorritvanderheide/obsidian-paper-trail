# Paper Trail

[![Donate](https://liberapay.com/assets/widgets/donate.svg)](https://liberapay.com/BW20)

**A reading queue for your Zotero library, and a record of what you decided.**

You have four hundred papers and time for forty. Reference managers help you
collect and annotation tools help you read, and both assume the choosing already
happened. It happens constantly, in seconds, and nothing records it, so the same
paper comes back in a search three years later and you assess it from nothing.
Then you write the chapter and have to say how the corpus was narrowed.

Paper Trail keeps one list of what you owe each paper, from the moment you save
it to Zotero to the moment you have said what it argues. You read in Zotero,
where your annotations go. When you finish a paper you say what came of it, and
Paper Trail writes its note with your annotations already in it and puts the
cursor where you write what it argues. A paper you drop or park keeps the reason
you gave, and the reasons export as a table for your methods section.

## How it works

The reading model is S. Keshav's *How to Read a Paper*: passes of increasing
cost, each ending in a decision about whether to make the next one.

```
→  ⟳  ⌃⌄
───────────────────────────────────────────
▾ Reading                                2
    So Much to Read, So Little Time
    Energy Cultures
▾ Claim                                  1
    Scholars Before Researchers
▾ Assessment                             1
    How to Read a Paper
───────────────────────────────────────────
▸ Deferred                               3
▸ Filed                                 41
```

**Reading** is what is worth an hour and not yet read. With triage off, which is
the default, everything in Zotero that your vault has no note for arrives here,
computed rather than stored, so importing four hundred search results gives you
four hundred rows and no files. Clicking a row opens the PDF in Zotero's reader,
and reading writes nothing in your vault. When you are done, the tick asks what
came of it:

- *Worth summarising*: a second pass is enough.
- *Worth a third pass*: the paper will also owe an assessment.
- *Worth another hour, but not now*: it asks what has to happen first, and when
  it should come back.
- *Not worth finishing*: it asks why.

The first two take you to the paper's note, written then if it has none, with
the cursor under its Claim heading and your annotations directly below.

**Claim** is the other half of Keshav's second pass. His test for it is that
*you should be able to summarize the main thrust of the paper, with supporting
evidence, to someone else*, and this is where you do: one or two sentences in
your own words, saying what the paper argues and what it sits with or against.
Tick it off when it is written. If there is nothing under the heading, the tick
offers to take you there instead.

**Assessment** is the third pass, for the few papers you promote: arguing with a
paper you can already summarise. Ticking off a promoted paper's claim takes you
straight there, while the claim is fresh.

**Triage** is optional, and off. Leave it off if you read the abstract in the
browser and only save what you want, because then saving was the decision and
papers arrive ready to read. Turn it on if Zotero is where you put things you
have not decided about: each paper then comes up first with its title, venue,
year and abstract, and three answers: drop it and say why, queue it, or mark it
already read.

Below the stages, two sections hold the papers nothing is outstanding for.
**Deferred** is what you parked, with the condition you set in each row's
tooltip, so a promise to come back stays in front of you with a count on it.
**Filed** is the rest, dropped, summarised or assessed, newest first. Neither is
ever counted as outstanding.

A deferral comes back by itself. When you defer a paper you say what has to
happen first, and pick when to look again: once you have read another paper
that is still unread, in two weeks, a month, three months or six, or never. When
that comes, it goes back to the stage it left, Reading or Claim, with a clock
before its title and your condition in its tooltip, and **Next** can offer it.
Its note still says deferred until you decide something: read it, defer it
again for another date, or drop it.

### Working the list

Clicking a row takes you to the work: Zotero for a reading, the heading for a
claim or an assessment, the dialog for triage, and the paper itself from
Deferred or Filed. The button at the end of each row, shown on hover, does the
same and says in advance where the click goes. The row for the note you are in
is marked, and clicking it never takes the cursor off what you are writing; its
button still takes you back to the heading.

**Next** opens the most perishable thing you owe: a claim before an assessment,
both before a new reading, and triage last. A paper you read yesterday decays,
and one you have never opened will triage just as well in March.

Right-click any row to change where it is: the menu lists the reading statuses
that would move that paper. **Set reading status** offers the same ones from the
command palette and the pill at the top of every paper, and says where each
choice lands. A paper you have already read can be sent back to be read again,
keeping everything you wrote.

Nothing here refuses: there is no order you have to work in, and no stage that
locks until an earlier one is clear.

The queue lives in the sidebar (ribbon icon, or **Open queue**). **Insert queue
block** puts the stages on a note of your own, such as a dashboard: what is
outstanding and nothing else, without the toolbar, and without Deferred and
Filed, which would pour a record of everything you have finished into your note.

## The note

Each paper gets one note, named for its Better BibTeX citation key, or for its
author, title and year without Better BibTeX. Under a frontmatter block holding
what Zotero knows about the paper and what you decided about it, the note
starts as a title, links to the item and the PDF, and your annotations:

```markdown
# How to Read a Paper

[Zotero](zotero://select/library/items/ABCD2345) · [PDF](zotero://open-pdf/library/items/EFGH6789)

<!--paper-trail-->

## Annotations

> a passage you highlighted in Zotero (p. 4) ^zt-JKLM2345

a note you wrote on it

<!--/paper-trail-->
```

The Claim heading is written in above the annotations when the paper comes to
owe a claim, and the Assessment heading when its claim is ticked off, so a paper
dropped on its abstract stays three lines long rather than carrying an outline
of work that never happened. The question for each is drawn faintly on the
empty line and disappears as you type. It is written into no file.

The annotations are every Zotero annotation with text or a comment:
highlights, underlines, and notes stuck to a page. They refresh whenever you
open the note while Zotero is running, and are only written when something has
changed. Each is anchored by its Zotero key, so a link to one passage keeps
resolving across refreshes, and a passage that crosses a column or a page
arrives as one line.

A paper nothing is outstanding for opens rendered rather than in the editor. It
turns rendered the moment it stops owing anything, when you tick off its last
pass, defer it or drop it, and goes back to the editor when you put it back on
the list. Its title bar carries a refresh button, the paper's next step, and
its reading status as a pill that opens the chooser. On a deferred or dropped
paper, hovering the pill shows the reason you gave.

## What a note is for

A literature note that says what a paper says has already lost. The abstract is
better written, it is in Zotero, and it is one click away. So the note has to be
the thing the paper cannot be: the smallest thing that can stand in for the
paper in your argument.

The test is unkind. If you would still open the PDF to write the paragraph, the
note failed. Not to check a quote, which is what the page anchors are for, but
to remember what the thing was and what you thought of it.

Over five years the adversary is not comprehension, it is forgetting. In two
years you are a stranger to your own reading, and a note that needs you to have
read the paper recently is a note that has expired.

Which is why the two headings are separate and named. **Claim** is what the
paper argues, in your words, because a paraphrase you cannot produce now is one
you will not produce at writing time either; in one or two sentences, because a
page-long summary is a thing you have to re-read, which is the same failure one
level up. **Assessment** is your quarrel with it: what strains, what it is
assuming, what the evidence is actually doing. That half cannot be got anywhere
else, and a note with no friction in it will only ever be cited for background,
which is the cheapest thing in a thesis.

Keeping the two apart is the point of naming them. At writing time you always
know whose sentence you are holding, and blurring that is not a tidiness
problem.

The arithmetic decides the rest. Four hundred papers at twenty minutes a note is
a hundred and thirty hours, so the twenty seconds on an abstract, the two
sentence cap, and the assessment asked only of papers you promoted are not
minimalism. They are the budget, and anything else a note might carry has to be
paid for out of it.

One thing is worth the price. A literature review is not a list of papers, it is
a claim about a field: who agrees with whom, what is assumed in common, where
the gap is. Those are edges between papers, and the edges are where a
contribution lives. So the claim asks for both, what the paper argues and what
it argues with or against, and it asks at the only moment the second question
is cheap: having just said what a paper claims is exactly when you know whether
it contradicts something you read in March.

**Insert citation** writes the link, and it is one thing doing three jobs. The
link is a wikilink to the citation key, so `against [[jones2021sampling]]` in a
claim reads as a citation, exports as one through pandoc, and puts this paper
in Jones's backlinks. Which papers spoke to which is the question a thesis asks
of its own corpus, and the backlinks pane is where it gets answered.

Without Better BibTeX there is no citation key and none is wanted: notes are
named for author, title and year, so Obsidian’s own `[[` finds them by what you
would type. With it, a note is named for its key, `[[` finds papers by key
rather than by title, and **Insert citation** is what closes that gap.

## Citations

**Insert citation** picks an item from your Zotero library and writes
`[[citekey]]`. It needs Better BibTeX, which is what gives an item a citation
key. Better BibTeX's own dialog is a chord away in the picker, for
`[@key, p. 45]` and the other citations a bare key cannot express.

Pandoc turns those links into real citations with
[`pandoc/wikilink-citations.lua`](pandoc/wikilink-citations.lua), which is in
this repository:

```sh
pandoc chapter.md \
  --from=markdown+wikilinks_title_after_pipe \
  --lua-filter=pandoc/wikilink-citations.lua \
  --bibliography=Literature/library.bib \
  --citeproc --output=chapter.docx
```

The filter turns a wikilink into a citation only when the bibliography has an
entry by that name, so a link to a note of your own stays a link. Order
matters in that command: pandoc cannot read `[[...]]` at all without the
`--from` extension, and runs filters in the order given, so citeproc has to come
after the filter that creates the citations. Paper Trail does not run pandoc, or
anything else; exporting is your build's job.

## The record

A dropped paper is not a deletion. The note stays, and so does what you decided
about it:

| | |
| --- | --- |
| `reading` | what the paper earns: `untriaged`, `queued`, `promoted`, `deferred` or `dropped` |
| `reading-progress` | how far you got: `read`, `summarised`, `assessed`, or absent |
| `reading-date` | when the status last changed |
| `triaged-date` | when you first formed an opinion, written once |
| `reading-reason` | why, on a drop or a deferral |
| `reading-until` | on a deferral, the date it comes back |
| `reading-after` | on a deferral, the Zotero key of the paper it waits for |

The two halves are different kinds of fact. What a paper earns is a judgement
about it; how far you got is a report about you. Keeping them apart is why
dropping a paper you had summarised does not unsummarise it, and why picking it
back up returns it to where it was rather than to the start.

A refresh from Zotero never touches any of these. **Export excluded papers**
writes `Excluded papers.md` to the vault root: every paper you dropped or
deferred, oldest decision first, with its authors, year, date and reason, each
row linking back to the paper. It is plain markdown, ready for an appendix or a
methods section, and it is rewritten on every run. It only ever replaces a file
it wrote itself, so a note of yours by that name is left alone.

## Requirements

- **Zotero 7**, running, with *Allow other applications on this computer to
  communicate with Zotero* enabled in Settings → Advanced. Paper Trail talks to
  its local API on `127.0.0.1:23119` and to nothing else. When Zotero is not
  answering, the queue says so rather than showing an empty list.
- **Better BibTeX**, optional. With it, notes are named for the citation key and
  **Insert citation** has a key to insert. Without it, notes get an
  author-title-year name and everything else works the same.
- **Obsidian 1.13** or later, on desktop.

## Installation

Download `main.js`, `manifest.json` and `styles.css` from the latest release
into `.obsidian/plugins/paper-trail/` in your vault, then enable **Paper Trail**
under Settings → Community plugins.

On first load it opens the queue in the sidebar and checks that Zotero is
answering. Save a paper to Zotero, come back to Obsidian, and it is in Reading.

## Commands

None has a hotkey, so pick your own.

| Command | |
| --- | --- |
| **Open queue** | Show the queue in the sidebar. |
| **Next** | Open the most perishable thing you owe. |
| **Set reading status** | Queue, promote, defer or drop the open paper, or send it back to be read again. |
| **Refresh paper from Zotero** | Refresh the open paper now, and say so. Opening a paper already does this quietly. |
| **Insert citation** | Insert `[[citekey]]` for an item from your Zotero library. |
| **Insert queue block** | Put the stages on the note you are editing. |
| **Export excluded papers** | Write `Excluded papers.md`: every dropped and deferred paper, and why. |

## Settings

| Setting | Default | |
| --- | --- | --- |
| **Papers from** | Whole library | One Zotero collection, when your library holds more than this thesis. Papers outside it that already have a note keep working. |
| **Triage before reading** | Off | Ask about each paper before it reaches Reading. |
| **Template folder** | `Templates` | Where `Paper.md` lives. It is written there the first time a paper note is made, and your edits to it are kept. |
| **Papers folder** | `Literature` | One note per paper. |
| **Status tag** | Empty | Mirror each paper's status into a tag, such as `status/queued`. Empty writes none. |
| **Item key property** | `zotero-key` | The frontmatter property naming the Zotero item. Point it at whatever your existing literature notes use and they are recognised as they are. |
| **Show reading status on papers** | On | The pill in the title bar, and at the top of a rendered paper. |
| **Quieter notifications** | Off | Show only failures and warnings. |
| **Claim heading**, **Assessment heading** | `Claim`, `Assessment` | The headings the two written passes go under. |
| **Claim prompt**, **Assessment prompt** | A question | The faint text on the empty line under each heading. Empty turns it off. |

The stages and the reading vocabulary are not settings. They are the product:
an opinionated workflow rather than a rules engine that asks you to invent one.

## Safety

Paper Trail writes to a paper's note in three ways, and no others:

- A refresh from Zotero overwrites a fixed set of frontmatter keys (`title`,
  `aliases`, `authors`, `year`, `citekey`, `zotero`, and whichever property
  names the Zotero item) and the region between the two markers.
- A decision you make writes the fields under [The record](#the-record), and
  the status tag if you named a namespace for one.
- When a paper comes to owe a claim or an assessment, the heading for it is
  added above the annotations.

Nothing else is ever removed or rewritten: every other key, and every word you
wrote, is yours. Beyond what you ask it to insert, it never edits a note that
is not a paper; it reads no files outside your vault, and it runs no commands.

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
