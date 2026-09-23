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
→  ⟳  ⌃⌄
───────────────────────────────────────────
▾ Triage                                 3
    Reframing heat pump transitions
    Strategic Reading and Ontologies
    How to Read a Paper
▾ Reading                                2
    So Much to Read, So Little Time
    Energy Cultures
▾ Claim                                  1
    Scholars Before Researchers
▾ Assessment                             1
───────────────────────────────────────────
▸ Filed                                 41
```

Four sections, in the order a paper passes through them. Three buttons above
them: **Next**, which takes the top row of the topmost section that has one so
that working the pile needs no decision about which pile first; ask Zotero now,
for when it was shut and has come back; and collapse or expand the lot.

Clicking a row takes you to the work. Reading opens the PDF in Zotero, Claim
and Assessment drop the cursor under their heading ready to write, and a paper
still to be triaged opens its dialog. Which is not the same as showing you the
paper, and it is the section that says where the difference lies: a paper you
have not read has a note that is a title and a link, so being shown it is being
shown nothing, while a paper you have read has a note with a section waiting in
it.

The same thing is on a button at the end of the row, appearing when you hover,
which is what says in advance where the click will go. Reading also offers a
tick for when you are done. Stages fold away when you are not working them.

Reading writes nothing at all. Opening a PDF is not a decision, so a paper
Zotero holds and the vault does not still has no note when you come back from
it; saying what came of the reading is what writes one, and the highlights are
fetched then, so nothing is lost by waiting. A finished note opens rendered
rather than in the editor, because the writing is over and what is left is
something to read, and the copy you already had open turns rendered the moment
you tick the last pass it owed.

Two sections sit under the stages, for the papers nothing is outstanding for.
**Deferred** is the papers you parked, each row carrying the condition you set
when you parked it, so a promise to come back is in front of you with a count
on it rather than filed away among the finished. **Filed** is the rest:
dropped, read, assessed, newest first, each with the icon of the decision that
put it there. Neither is ever counted as outstanding or offered by **Next**,
and right-clicking a row in either is how a paper comes back.

Between them they take whatever height the list leaves over, so they sit on the
floor of the pane when there is room and scroll along at the end of the list
when there is not. Both shut until you open them. Every other section answers
by getting shorter, so this is the only place a morning of triage leaves a mark.

It lives in the sidebar (ribbon icon, or **Open queue**), and **Insert queue
block** will put the same list on a note of your own. The block is the list and
nothing else: the three buttons stay in the pane, where the plugin lives, rather
than sitting on top of your writing. Its rows still act, and **Next** is in the
palette.

Nothing here refuses: there is no order you have to work in and no stage that
locks until an earlier one is clear.

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

## The passes

The reading model is S. Keshav's *How to Read a Paper*: increasingly expensive
passes, each ending in a decision about whether to make the next one.

Three passes, four sections. Keshav's second pass ends in a test rather than a
document, and writing the summary down is this plugin's own addition to it. So
it gets a section of its own, because a section here is named for what a paper
is waiting on, and a paper you have read but not summarised is not waiting to
be read.

**Triage** is what Zotero holds that your vault has no note for. It is computed,
not stored, so importing four hundred search results gives you four hundred rows
and zero files. Nothing is written until you act on one, and acting is what
makes the note.

If your Zotero is older than this thesis, point **Papers from** at one
collection and only that collection arrives. Papers outside it that already have
a note go on working: it narrows what turns up, not what counts as a paper.

Triage is opt-in, and off. Leave it off if you read the abstract in the browser
and only save to Zotero what you want: the deciding happened there, so papers
arrive already queued to read. Turn it on if Zotero is where you put things you
have not decided about, and each one comes up with its title, venue, year and
abstract, and three buttons: drop it and say why, queue it, or mark it already
read.

**Reading** holds what triage kept. Its button opens the paper in Zotero, where
your highlights belong. When you are done, **Reading finished** asks what came
of it, in Keshav's terms: *worth summarising*, *worth a third pass*, *worth
another hour, but not now*, or *not worth finishing*.

**Claim** is the other half of that pass, and it has its own section because it
is different work. Keshav's test for the second pass is not that you have
stopped reading, it is that *you should be able to summarize the main thrust of
the paper, with supporting evidence, to someone else*. You have just said you
can. This is where you make good on it.

Saying so takes you straight to the note, cursor on an empty line under the
Claim heading, with the highlights Zotero synced sitting right below. Write what
the paper argues, in your own words, and what it sits with or against, and tick
it off. The pencil on the row puts you back in the same place whenever you come
back to it, and the tick beside it is what ends the pass. Arrive at a claim you
have already written and nothing is moved and nothing is asked: you are taken
to it and left alone.

The tick asks once, when there is nothing under the heading at all: an empty
section is a tick pressed on the wrong row or before the work rather than a
claim you consider short, so it offers to take you there instead. Write one
word and it never appears.

The tick rather than the prose, and that is a deliberate retreat. The plugin
used to watch the heading and call the pass finished the moment anything
appeared under it, which read the state straight off what you had written and
needed no extra press. One character counted, so the paper left the section
mid-sentence, and there was nowhere to leave yourself a note under a heading
without it being taken for the work. What is under the heading is yours; the
status says only that you consider it done.

Ticking moves `reading-progress` on, and leaves `reading` alone. The two are
different kinds of fact: what a paper earns is a judgement you made about it,
and how far you have got is a report about yourself. Keeping them apart is why
dropping a paper you had summarised does not unsummarise it, and why picking it
back up returns it to where it was rather than to the start.

It is also why **Set reading status** offers five things rather than nine. You
pick from the judgements; the reports are ticked off on the row that owes them.

The plugin writes none of it, only the heading it goes under. A new paper is a
title, its links and the highlights region; the Claim heading is written in
above the highlights at the moment the paper comes to owe a claim, and the
Assessment heading when the claim is ticked off. So the section is there
whenever you open the note, however you got to it, and a paper you drop on its
abstract stays three lines long rather than carrying an outline of work that
was never going to happen. The question is put in the moment you arrive, rather
than left lying in the file as a comment you would have to type around and then
delete.

**Assessment** is for the few papers you promote, and ends the same way. It is
Keshav's third pass: arguing with a paper you can already summarise.

## The record

A dropped paper is not a deletion. The note stays, and so do:

| | |
| --- | --- |
| `reading` | what the paper earns: `untriaged`, `queued`, `promoted`, `deferred` or `dropped` |
| `reading-progress` | how far you got: `read`, `summarised`, `assessed`, or absent |
| `reading-date` | when the status last changed |
| `triaged-date` | when you first formed an opinion, written once |
| `reading-reason` | why, on a drop or a deferral |

Nothing about Zotero overwrites those. **Export excluded papers** turns
them into a plain markdown table, oldest first, every row linking back to the
paper, ready for an appendix.

## Your own notes

Paper Trail has no opinion about them. It writes nothing on a note you wrote,
asks nothing about it afterwards, and the queue is papers only. Making notes is
what Obsidian's own Templates plugin is for.

**Insert citation** writes `[[citekey]]`, a link rather than pandoc syntax. It
resolves, because a paper is named for its citation key and carries it as an
alias either way; it opens the paper; it shows the paper on hover; and every
place you cited something turns up in that paper's backlinks, which is the
question a thesis asks of its own corpus. It is still exportable: a link whose
target is a citation key is something a pandoc filter turns into a real
citation. Better BibTeX's own dialog still writes `[@key, p. 45]` for the
citations a bare key cannot express, and pandoc reads those natively.

```sh
pandoc chapter.md \
  --from=markdown+wikilinks_title_after_pipe \
  --lua-filter=pandoc/wikilink-citations.lua \
  --bibliography=Literature/library.bib \
  --citeproc --output=chapter.docx
```

[`pandoc/wikilink-citations.lua`](pandoc/wikilink-citations.lua) is in this
repository. It makes a wikilink a citation only when the bibliography has an
entry by that name, so a link to a note of your own stays a link. Order matters
in that command: pandoc cannot read `[[...]]` at all without the `--from`
extension, and runs filters where you write them, so citeproc has to come after
the one that creates the citations.

The plugin does not run it, and never runs anything. Exporting is your build's
job; this is what it needs to read what the plugin writes.

A literature note carries its buttons in its own title bar: refresh from Zotero,
and whatever that paper is waiting for.

It also carries its state, as a pill that opens the chooser when you click it.
While you edit, the pill is in the title bar; in reading view, embeds and hover
previews it is at the top of the note, because a preview renders the file afresh
and cannot see anything a pane added. **Show reading status on papers** turns it
off. Nothing about it is written into the note: the frontmatter is the record,
and this only reads it.

## Safety

Paper Trail owns a fixed set of frontmatter keys (`title`, `aliases`, `authors`,
`year`, `citekey`, `zotero`, and whichever property names the Zotero item) and
one delimited region:

```
<!--paper-trail-->
## Highlights

> a passage you highlighted in Zotero (p. 4) ^zt-ABCD2345
<!--/paper-trail-->
```

The markers are HTML comments, so they are invisible in a rendered note and
Obsidian's metadata cache calls them `html` rather than prose. That matters
because the region follows the assessment heading once there is one, and what
the cache calls that line is what decides whether a paper is still owed a
third pass.

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
- Desktop only, because it talks to Zotero over localhost. It reads no files
  outside your vault.

It never runs a shell command, and the only thing it talks to is Zotero on
localhost. It does not need another Zotero-to-Obsidian bridge; it creates the
literature note itself.

## Settings

Mostly addresses rather than opinions: which Zotero collection to triage from,
which folders hold your papers and the template, which frontmatter property
names the Zotero item, and which headings Claim and Assessment end under. Point
the item key property at whatever your existing literature notes use and they
are recognised without being rewritten.

One is not an address. **Triage before reading** records what putting an item in
Zotero means to you, which is the one thing the plugin cannot work out and the
one thing that decides whether it asks you a question you have already answered.

The stages and the `reading` vocabulary are not configurable. They are the
product. Paper Trail writes no tags of its own either, beyond the reading status
mirror you get by naming a namespace in **Status tag**: how you file your notes
is yours, and a plugin that stamped its own vocabulary on them would leave you
editing every file to undo it.

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
