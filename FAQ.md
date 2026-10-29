# Frequently asked questions

Can't find your answer here? Please
[open an issue](https://github.com/jorritvanderheide/obsidian-paper-trail/issues/new/choose).

- [Connecting to Zotero](#connecting-to-zotero)
- [Papers and notes](#papers-and-notes)
- [Annotations](#annotations)
- [Citations](#citations)
- [Settings](#settings)

## Connecting to Zotero

### "Zotero is not answering. Is it running?"

Paper Trail reads everything from Zotero while it runs, so Zotero has to be
open. Start Zotero, then click back into Obsidian. The queue asks again whenever
Obsidian gets focus.

If Zotero is open and you still see this, something else may be using port
23119, or security software may be blocking connections between programs on
your computer.

### "Zotero said no. Allow other applications in its Settings → Advanced."

Zotero doesn't let other programs read your library until you turn on *Allow
other applications on this computer to communicate with Zotero*, in Zotero's
Settings → Advanced. It's off by default, and you need Zotero 7 or later to
have it. Once
it's on, click back into Obsidian, and the queue asks Zotero again.

### Does it work on mobile?

No. Paper Trail talks to the Zotero desktop app running on the same computer,
and on a phone or tablet there isn't one to talk to. Your paper notes do sync to
mobile and are plain markdown there, but the queue and the commands need
Obsidian on your desktop.

## Papers and notes

### I read a paper, but it still has no note

That's on purpose. Reading a paper doesn't write anything to your vault. The
note is made when you decide what came of it. Tick the paper off in the queue
and choose an answer, and the note is written then, with all your annotations
in it.

### A paper I saved doesn't show up in the queue

A few things to check:

- **Is Zotero running?** The queue only knows what Zotero tells it.
- **Did you save it while you were in Obsidian?** The queue asks Zotero what's
  new when Obsidian gets focus. Click into another window and back, and it's
  there.
- **Is it under Papers from?** Only papers in the libraries and collections
  listed there show up. With **Include subcollections** off, a paper that is
  only in a subcollection doesn't.
- **Is it in Triage?** If the switch next to where it came from is on, under
  **Papers from**, it waits there instead of in Reading.
- **Is it in a group library?** Add the group, or a collection in it, under
  **Papers from**. Groups aren't read until you do.

### "A collection under Papers from isn't in Zotero anymore"

A collection you added under **Papers from** was deleted in Zotero. In Paper
Trail's settings it's marked as not in Zotero. Delete it from the list, or add
the one you meant. The other sources keep working.

### "A group under Papers from isn't in Zotero anymore, or you've left it"

Zotero doesn't list that group anymore, because it was deleted or you left
it. In Paper Trail's settings it's marked as not in Zotero. Delete it from the
list. Notes you already have for its papers keep working, and the other sources
do too.

### The same paper is in my library and a group's

Zotero keeps them as two items, but the queue shows the paper once, from
whichever of the two comes first under **Papers from**. They count as the same
paper when they have the same DOI, or the same citation key and title. A note
for either copy counts as the paper's note.

### "Nothing is chosen under Papers from"

The list under **Papers from** is empty, so no papers come in from Zotero.
Papers that already have a note still work. Add your library, or a collection
in it, in Paper Trail's settings.

### "… isn't a paper's note, because it has no zotero-key property"

Paper Trail recognises a paper by one property, which holds the Zotero item
key. A note without it isn't a paper, wherever it is in your
vault. If your existing literature notes keep the key under another name, set
**Item key property** to that name and they are recognised as they are.

### My existing literature notes aren't recognised

If they already hold the Zotero item key under another property, point **Item
key property** at it.

If they don't have the item key at all, which is how Zotero Integration and
the Citations plugin make them, run **Link existing notes to Zotero**. It
matches each note to its paper by citation key, from a `citekey` property or
from the note's name, with or without an `@` in front. Before it changes
anything, it tells you how many notes it found and which of their properties
will be replaced with what Zotero has. It only adds the item key property, and
the rest is filled in when you open each note. The linked papers show up in
Triage, where you can mark the ones you've already read.

### "Zotero didn't give any of your papers a citation key, so there's nothing to match your notes by"

**Link existing notes to Zotero** matches notes by citation key, and Zotero
only has those with [Better BibTeX](https://retorque.re/zotero-better-bibtex/)
installed. Install it, and run the command again.

### "Found no notes to link"

None of your notes has a `citekey` property or a name that matches a citation
key in your Zotero library. A note that's already a paper's note, or that has
the item key property with something else in it, isn't looked at.

### Can I change a paper's status by hand?

Yes. Change `reading` in the note's properties and the queue follows, because
the note is the record. A value Paper Trail doesn't recognise counts as
`untriaged`. Only a decision made in Paper Trail tidies up the fields around it,
such as the reason and the dates.

### I renamed the Claim heading, and now a paper has two

Paper Trail finds the heading by its name. When you rename it in the settings,
notes that already have the old heading keep it, and when one of those papers
needs the section again, it gets a second heading with the new name. The
setting warns about this and tells you how many papers use the current name.
To avoid it, rename the heading in those notes too, for example with Obsidian's
search and replace.

## Annotations

### Whose annotations are in a group paper's note?

Everyone's. In a group library, the paper's note gets every annotation on its
PDF, yours and the rest of the group's, the way Zotero shows them. Zotero
doesn't tell Paper Trail who made which, so it can't leave out other people's.

### The annotations section is empty

Check these in order:

- **Was Zotero running when you opened the note?** Annotations are only
  refreshed then. Open the note again, or run **Refresh paper from Zotero**.
- **Are the annotations on this paper's PDF?** Paper Trail reads one attachment
  per paper: the first PDF, or an EPUB or web snapshot if there is no PDF.
  Annotations on a second PDF, such as a supplement, aren't synced.
- **Do they have text?** Only annotations with text or a comment come through:
  highlights, underlines and notes. A drawing or an image selection without a
  comment has nothing to show.
- **Are they underlines?** With **Include underlines** off, an underline only
  comes through if you commented on it.

### Why is an annotation a plain quote instead of coloured?

Its colour isn't one of the eight in Zotero's reader. That happens with
annotations that were already in the PDF when you added it, which keep the
colour of whatever program made them. Paper Trail doesn't guess the nearest
colour, so it shows them as a plain quote.

### Can I edit the annotations in the note?

You can, but your edits are replaced at the next refresh. Everything between
`<!--paper-trail-->` and `<!--/paper-trail-->` belongs to Paper Trail. Write
your thoughts under the Claim or Assessment heading instead, or add a comment
to the annotation in Zotero, which does come through.

### "The annotations in … weren't updated, because the lines that mark where they go are missing or doubled."

Paper Trail only replaces what's between one `<!--paper-trail-->` line and one
`<!--/paper-trail-->` line below it. If one of them was deleted, or there are
two of either, it can't tell your writing from its annotations, so it leaves
the note alone until you fix it. A marker you quoted in a sentence of your own,
like `<!--/paper-trail-->` in backticks, doesn't count. Open the note in source
mode, keep one of each around the annotations, and run **Refresh paper from
Zotero** again.

### "The annotations in … weren't added, because the lines that mark where they go are missing or doubled in your template, …"

Every new paper note starts from your Paper template, in the template folder.
Its marker lines are broken, so the new note's are too, and its annotations
can't go in. Open the template in source mode and keep one `<!--paper-trail-->`
line with one `<!--/paper-trail-->` line below it. Do the same in the new note,
and run **Refresh paper from Zotero** on it.

## Citations

### Where did Insert citation go?

It moved to [Due Credit](https://community.obsidian.md/plugins/due-credit) in
Paper Trail 2.0.0, along with **Add page to citation**. Due Credit is for
citing and Paper Trail is for reading, and each works without the other. Due
Credit's **Insert citation** picks from your bibliography (the `.bib` file
Better BibTeX exports). That's the same file it cites from when it exports, so
every paper you can pick is one it can cite. Bind its commands to the hotkeys
you had for Paper Trail's. Without Due
Credit, type the link yourself: `[[citekey]]`.

### How do I export my citations to Word or PDF?

Paper Trail doesn't export anything itself. Use
[Due Credit](https://community.obsidian.md/plugins/due-credit), which turns your
`[[citekey]]` links into real citations and a reference list.

### My citation comes out with double parentheses

Don't put your own parentheses around a citation, because the export adds
them. Write `as shown by [[a]]`, not `as shown by ([[a]])`.

## Settings

### Can I add my own stage or reading status?

No, and that's on purpose. The stages and statuses are what make the queue
work, because it knows what each one means and what to do next. You can switch
Triage, Claim and Assessment off, and keep extra steps of your own in your own
properties next to Paper Trail's. See
[Your own views](README.md#93-your-own-views).

### Why don't the commands have hotkeys?

You already have hotkeys Paper Trail knows nothing about, and a default that
collides with one of yours is worse than no default. Pick your own in Settings
→ Hotkeys.
