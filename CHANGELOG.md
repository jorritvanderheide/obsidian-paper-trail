# Changelog

What changed in each release of Paper Trail, newest first. What counts as
breaking is in [Compatibility](docs/compatibility.md).

## 2.1.4

- A passage from Zotero that ends in a backslash, like `C:\temp\`, keeps it
  in an export. Paper Trail writes it as `\\`, which Obsidian shows as one
  backslash too, in the Annotations section and in **Insert annotation**.
  Pandoc read a single one before the page or the citation as a space.

## 2.1.3

- A note can no longer lose your writing because something in it looks like a
  marker line. With the `<!--paper-trail-->` or `<!--/paper-trail-->` line
  deleted, 2.1.1 and 2.1.2 could take a marker in a list item, a quote, a
  callout, a code block or the properties for the missing one, and replace
  your text up to it. A marker now counts only on a line of its own, outside
  code blocks and properties, and a note missing one is left alone.
- A marker joined onto the line above or below no longer counts, so that note
  is left alone too, and **Refresh paper from Zotero** says how to fix it.
  2.1.2 put it back on its own line, which turned out not to be safe.
- In a note with Windows line endings, a written claim counts as written, and
  the Claim heading isn't added a second time.

## 2.1.2

- A note can no longer lose your writing because a marker line is quoted in
  it. If the `<!--/paper-trail-->` line under the annotations was deleted and
  your text quoted that marker further down, 2.1.1 took the quote for it and
  replaced everything in between. A marker quoted in a sentence never counts
  now, and a note whose real one is missing is left alone again.
- A marker joined onto the line above or below is put back on a line of its
  own when the annotations are refreshed. Until then, a claim it was joined
  onto still counts as written, and a new heading no longer lands above it.
- The title of a new paper's note is written so a `%%` or `<!--` in it opens no
  comment. 2.1.1 did this without saying so.

## 2.1.1

- A note whose `<!--paper-trail-->` marker got joined onto the line above, as
  pressing Delete at the end of that line does, keeps its annotations up to
  date. Since 2.0.2 they stopped updating. A note with both markers on one
  line no longer gets a second copy of its annotations.
- A comment in Zotero that reads like your Claim or Assessment heading, such as
  `## Claim`, is no longer taken for it. What you wrote under it was inside the
  annotations, and gone at the next refresh.
- If your Paper template's marker lines are missing or doubled, Paper Trail
  says so when it makes a paper's note, and which file to fix. The note's
  annotations used to be left out without a word.
- A quoted `<!--` exports as itself. 2.1.0 wrote it so it showed in Obsidian,
  but pandoc turned its `--` into a dash.
- A note with Windows line endings keeps them when its annotations are
  refreshed. Paper Trail used to mix in its own.
- Since 2.1.0, a paper whose key has a colon or a slash gets a note named with
  a dash. Citations to it need Due Credit 1.7.0 or In the Open 1.4.0 for a
  colon, and Due Credit 1.8.0 or In the Open 1.5.0 for a slash. Update those
  too, or the citations come out as plain text.

## 2.1.0

- A paper whose citation key has a character a note's name can't have, like
  the colon in `smith:2017`, gets a note. Paper Trail used to fail to make it.
  The note is named `smith-2017`, and its `citekey` property keeps the key as
  it is, so citations to it still find the paper.
- A `%%` or `<!--` in a passage or a comment from Zotero no longer hides
  everything after it in the note, in Obsidian and in an export. It's written
  so it shows as itself.
- **Insert annotation** checks again, once you've picked the passage, that the
  cursor isn't in a paper's annotations, where the quote would be gone at the
  next refresh. It only checked before you picked.
- A note in your template folder is never taken for a paper, even with a
  paper's properties in it. Only the queue left templates out. Now **Link
  existing notes to Zotero**, **Insert annotation**, **Export excluded papers**
  and the counts in the settings do too.

## 2.0.2

- A paper's note no longer loses your writing when the `<!--/paper-trail-->`
  line under its annotations was deleted. Opening the note twice used to
  replace everything from the annotations to the end of the note, including
  what you'd written below them. Now a note whose marker lines are missing or
  doubled is left alone, and **Refresh paper from Zotero** says how to fix it.
- A note with only the `<!--/paper-trail-->` line no longer gets another copy
  of its annotations every time you open it.

## 2.0.1

- Plainer, friendlier wording in the README, the FAQ, the settings and the
  messages.
- When Zotero refuses to answer, the message now says what to allow, in
  Zotero's own words: other applications, in its Settings → Advanced. It used
  to say "local API", which Zotero's settings never mention.
- When a note is in the way of a new paper note or the excluded papers report,
  the message asks you to rename or move it, and no longer suggests deleting
  it.
- An error from Zotero now says to try again, and to restart Zotero if it
  keeps happening.
- The bug report form asks about **Papers from** and **Triage first** as they
  have worked since 1.8.0.

## 2.0.0

**Breaking:** citing moves to Due Credit, and Paper Trail is for reading.

- **Insert citation** and **Add page to citation** are now
  [Due Credit](https://community.obsidian.md/plugins/due-credit)'s, from 1.4.0.
  Install it, and bind its commands (`due-credit:insert-citation`,
  `due-credit:add-page`) to the hotkeys you had for Paper Trail's. Its picker
  reads your bibliography, the `.bib` Better BibTeX exports, instead of
  Zotero, so whatever you pick it can cite. Without Due Credit, type the link
  yourself: `[[citekey]]`.
- **Better BibTeX's dialog** (Shift+Enter in the picker) is gone with it. For a
  prefix, or to leave out the author, type them in the link's label, as
  `[[a|see -a, p. 4]]`.
- **Insert annotation** stays, and so does everything else.
- The Claim heading's question no longer names Insert citation. If you never
  changed it, you get the new wording.

## 1.8.0

- **Papers from** takes several sources, each with its own subcollections and triage, grouped under their library.
- Zotero group libraries: add a group, or a collection in it, under **Papers from** and its papers come into the queue. A paper that's in your library and a group's shows up once. A group paper's note gets every annotation on its PDF, the group's as well as yours.
- New setting **Include subcollections**, on by default: a collection under **Papers from** also brings in the collections under it.
- **Insert citation** also searches the group libraries under **Papers from**.
- **Set reading status** on a paper you've read now says what each choice does: **Assess it too**, **Skip the assessment**, **Read it again, keeping what you wrote**, **Come back to it later** and **Leave it out**, instead of the words meant for a paper you haven't read yet. Dropping or deferring it asks in matching words too.
- New in **Set reading status**: **Reopen the claim** and **Reopen the assessment**, for a pass you ticked off too early. Your writing stays where it is.
- **Untriaged** is no longer offered for a paper you've already read. Sending it back to Triage did nothing useful.
- Fixed: hovering the status pill no longer says the status twice, as in "Summarised. Summarised. Nothing left to do."

## 1.7.0

- New command **Link existing notes to Zotero**: turns literature notes from Zotero Integration or the Citations plugin into paper notes, matched by citation key (from a `citekey` property, or a note named for its key, with or without an `@`). It tells you how many notes it found and which properties will be replaced with what Zotero has before it changes anything, and only adds the item key. The linked papers show up in Triage. Needs Better BibTeX.
- Right-click an annotation in a paper note and choose **Show in Zotero** to open the PDF at that annotation. Works in reading view and in the editor.
- Settings now show at the top of the Zotero section whether Zotero is answering and whether Better BibTeX is installed, with a button to check again.
- Fixed: opening a paper note no longer removes aliases you added to it yourself. Paper Trail now only adds the citation key alias, and keeps the rest.

## 1.6.0

- Annotations now show in the colour you gave them in Zotero. Each passage is written as a quote callout, like `> [!quote|zotero-yellow]`, so you can also search for a colour by name. Annotations that came inside the PDF, in a colour Zotero's reader doesn't offer, stay a plain quote.
- New command **Insert annotation**: pick a paper, then one of its annotations, and it's inserted as a quote with a citation to its page.
- New setting **Include underlines**, under Zotero. Turn it off if you underline terms and highlight passages: only underlines you commented on still come through.
- Annotations made in Zotero's Reading Mode now show up in the right place on their page, rather than at the top of it.
- Each paper note is rewritten once, the first time you open it after updating, to add the colours. Nothing you wrote outside the annotations section is touched.

## 1.5.1

- How releases are built, and how to check the file you installed, is now under "Network and file disclosure" in the README. Safety and quality points to it.
- The FAQ asks "Does it work on mobile?", the same way the other plugins' FAQs do.
- The development docs describe trying a build in a vault the same way as the other plugins.

## 1.5.0

- Friendlier wording throughout the interface: commands, notices, the reading-status chooser and the settings tab.
- New default prompts under the Claim and Assessment headings. If you never changed a prompt, you get the new wording automatically. A prompt you wrote yourself, or cleared, is kept as it is.
- A shorter plugin description: "Work through your Zotero library as a reading queue, and keep a record of what you decided."
- Removed the funding link from the manifest.
- The README has been restructured and now has screenshots, and there's a new FAQ.
- Added issue forms and a security policy.

## 1.4.1

- Placeholders in the paper template (Paper.md) now ignore case and spaces inside the braces, the way Loose Ends reads its own. {{title}}, {{ Title }} and {{TITLE}} are all the same placeholder. Your existing Paper.md keeps working without any edits.
- The template that ships with the plugin now uses the lowercase names {{title}} and {{links}}. This only affects a Paper.md written from now on. A template already in your vault is left as it is.

## 1.4.0

- Better BibTeX’s dialog inserts links now. It used to insert pandoc text like `[@key, p. 4]`, which does nothing in Obsidian. It now inserts [[key|key, p. 4]], a link that opens the paper, shows it on hover and counts in its backlinks.
- Prefix, suffix and author suppression are in the link label. For example `[[key|see key, p. 4, emphasis added]]`, or `[[key|-key, p. 4]]`  to leave the author out. Several sources are joined with `; `.
- Add a page in the picker with Tab. In Insert citation, press Tab instead of Enter and type the page. `4` becomes `p. 4`; `ch. 3` or `§ 2` go in as typed.
- New command: Add page to citation. It adds a page to the link at or just before the cursor, including links made with Obsidian’s own `[[`, so you don’t type the key twice. A page already there is replaced, and a label you wrote keeps its words. It has no hotkey until you set one.
- Citations link to the paper’s note by its name. When a paper has a note, the link goes to that note, so it still works if Better BibTeX changed the key after the note was created.
- Exporting moves to Due Credit. The pandoc filter is no longer in this repository. Due Credit, a companion plugin, exports notes and reads every form Paper Trail writes. The README now points there.

## 1.3.0

- Added a Written passes setting: claim and assessment, claim only, or none.
- The queue now redraws as soon as you change a setting.
- New installs keep the paper template in Templates/Paper Trail.
- The README shows how to build your own views over the reading fields with Bases or Dataview.

## 1.2.0

- Search the queue. A search button in the sidebar toolbar opens a box that narrows the pane to papers matching every word you type.
- Right-click menu on queue rows now leads with what the row’s buttons do (for example Reading finished and Open in Zotero), followed by the reading statuses that would move the paper. Papers in Deferred and Filed get the statuses only.

## 1.1.0

### Paper Trail 1.1.0

**A deferral comes back**

- When you defer a paper, you now pick when to look again: after reading another unread paper, in 2 weeks, in a month, in 3 months, in 6 months, or no date.
- Deferring uses the same chooser as the reading status, and each option shows the date it comes back on.
- Waiting on another paper fills in the condition for you ("After I have read …"). If you pick a date without typing a condition, you're asked for one afterwards.
- When the date passes, or the paper it waits on has been read or dropped, the paper returns to the stage it left (Reading or Claim). It has a faint clock before its title and your condition in its tooltip, and **Next** can offer it.
- Coming back writes nothing to the note. It stays deferred until you decide something: read it, defer it again, or drop it.
- Two new optional frontmatter keys, `reading-until` and `reading-after`. Papers deferred in 1.0.0 stay parked exactly as they were, and nothing needs migrating.

**Improvements**

- Hovering the status pill on a deferred or dropped paper shows the reason you gave.
- Right-clicking a row lists the reading statuses directly, only the ones that would move that paper.
- Promoted ("worth a third pass") is only offered for papers you've read.
- Putting a paper back on the list while its note is open switches the note back to editing view.
- **Quieter notifications** now hides everything except failures and warnings.
- New paper notes have a blank line between the frontmatter and the title. If your vault already has a `Paper.md` template, it isn't changed: add the line yourself, or delete the file and it comes back with it.

**Fixes**

- Dates are recorded in your local time zone. Before, a decision made near midnight could be stamped with the wrong day.
- The status pill keeps its width in themes that make title-bar buttons square, such as Border.
- The count on an empty section no longer brightens when you hover it.

## 1.0.0

### Paper Trail 1.0.0

The first release. Paper Trail turns your Zotero library into a reading queue in Obsidian. You read in Zotero, where your annotations go; Paper Trail keeps track of what you owe each paper, writes its note with your annotations in it, and keeps a record of what you ruled out and why.

### What it does

- **A reading queue in the sidebar.** Reading, Claim and Assessment, after S. Keshav's three passes, with Deferred and Filed below for the papers nothing is outstanding for. Everything you save to Zotero turns up in Reading, and nothing is written to your vault until you decide something about a paper. Right-click any paper to change its status.
- **Read in Zotero, decide in Obsidian.** Clicking a paper opens its PDF in Zotero's reader. When you finish, say what came of it: worth summarising, worth a third pass, worth another hour but not now, or not worth finishing.
- **One note per paper, with your annotations in it.** Highlights, underlines and page notes sync from Zotero into a region the plugin owns, and refresh whenever you open the note with Zotero running. A passage that crosses a column or a page comes through as one line, and each keeps a block link that survives refreshes.
- **Write what it argues.** Finishing a paper puts the cursor under its Claim heading, with a faint prompt on the line: one or two sentences in your own words, and what the paper sits with or against. Papers you promote get an Assessment as well. A tick ends each pass.
- **A record you can hand in.** Every drop and deferral asks why, and the reason stays in the paper's frontmatter. **Export excluded papers** turns them into a markdown table of every paper you dropped or deferred, ready for a methods section or an appendix.
- **Citations as links.** **Insert citation** writes `[[citekey]]`, which opens the paper, shows up in its backlinks, and becomes a real citation through the pandoc filter in the repository.
- **Next** opens the most perishable thing you owe: a claim before an assessment, and both before a new reading.
- **Optional triage.** Turn on **Triage before reading** to decide on each paper from its title, venue, year and abstract before it reaches Reading.

### Requirements

- Zotero 7, running, with *Allow other applications on this computer to communicate with Zotero* enabled under Settings → Advanced.
- Better BibTeX, optional. With it, notes are named for the citation key and **Insert citation** works.
- Obsidian 1.13 or later, on desktop.

### Installation

Download `main.js`, `manifest.json` and `styles.css` below into `.obsidian/plugins/paper-trail/` in your vault, then enable **Paper Trail** under Settings → Community plugins. On first load it opens the queue and checks that Zotero is answering.

### What it writes

A refresh from Zotero touches only the plugin's own frontmatter keys and the annotations region. Your decisions write the reading-status fields, a status tag if you name a namespace for one, and a Claim or Assessment heading when a paper comes to owe one. It never rewrites your prose, never edits a note that isn't a paper beyond what you ask it to insert, and talks to nothing but Zotero on your own machine.
