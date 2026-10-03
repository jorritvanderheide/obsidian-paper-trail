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
open. Start Zotero, then click back into Obsidian: the queue asks again whenever
Obsidian gets focus.

If Zotero is open and you still see this, something else may be using port
23119, or security software may be blocking connections between programs on
your computer.

### "Zotero refused. Turn on its local API in Settings > Advanced."

Zotero is running, but doesn't let other programs read your library yet. In
Zotero, open Settings → Advanced and turn on *Allow other applications on this
computer to communicate with Zotero*. This is off by default, and it needs
Zotero 7 or later.

### Does it work on mobile?

No. Paper Trail talks to the Zotero desktop app running on the same computer,
and on a phone or tablet there isn't one to talk to. Your paper notes do sync to
mobile and are plain markdown there, but the queue and the commands need
Obsidian on your desktop.

## Papers and notes

### I read a paper, but it still has no note

That's on purpose. Reading a paper doesn't write anything to your vault: the
note is made when you decide what came of it. Tick the paper off in the queue
and choose an answer, and the note is written then, with all your annotations
in it.

### A paper I saved doesn't show up in the queue

A few things to check:

- **Is Zotero running?** The queue only knows what Zotero tells it.
- **Did you save it while you were in Obsidian?** The queue asks Zotero what's
  new when Obsidian gets focus. Click into another window and back, and it's
  there.
- **Is the queue limited to one collection?** With **Papers from** set to a
  collection, only papers directly in that collection show up. A paper that is
  only in one of its subcollections doesn't.
- **Is it in a group library?** Paper Trail looks for new papers in your
  personal library only, so a paper that only lives in a group library doesn't
  show up.

### "The Zotero collection chosen under Papers from isn't there anymore"

The collection chosen under **Papers from** was deleted or moved in Zotero.
Pick another one in Paper Trail's settings, or choose **Whole library**.

### "… isn't a paper's note: it has no zotero-key property"

Paper Trail recognises a paper by one frontmatter property, which holds the
Zotero item key. A note without it isn't a paper, wherever it is in your
vault. If your existing literature notes keep the key under another name, set
**Item key property** to that name and they are recognised as they are.

### My existing literature notes aren't recognised

Same answer as above: point **Item key property** at the property your notes
already use for the Zotero item key.

### Can I change a paper's status by hand?

Yes. Change `reading` in the frontmatter and the queue follows, because the note
is the record. A value Paper Trail doesn't recognise counts as `untriaged`. Only
a decision made in Paper Trail tidies up the fields around it, such as the
reason and the dates.

### I renamed the Claim heading, and now a paper has two

Paper Trail finds the heading by its name. When you rename it in the settings,
notes that already have the old heading keep it, and when one of those papers
needs the section again, it gets a second heading with the new name. The
setting warns about this and tells you how many papers use the current name.
To avoid it, rename the heading in those notes too, for example with Obsidian's
search and replace.

## Annotations

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

You can, but your edits are replaced at the next refresh: everything between
`<!--paper-trail-->` and `<!--/paper-trail-->` belongs to Paper Trail. Write
your thoughts under the Claim or Assessment heading instead, or add a comment
to the annotation in Zotero, which does come through.

## Citations

### "… has no citation key. Install Better BibTeX in Zotero"

**Insert citation** needs a citation key, and Zotero only gives papers one when
[Better BibTeX](https://retorque.re/zotero-better-bibtex/) is installed.
Without it, you can still link to a paper note with Obsidian's own `[[`.

### "Couldn't reach Better BibTeX. Is it installed in Zotero?"

Shift+Enter in the citation picker opens Better BibTeX's own dialog, which only
exists when Better BibTeX is installed in Zotero.

### How do I export my citations to Word or PDF?

Paper Trail doesn't export anything itself. Use
[Due Credit](https://community.obsidian.md/plugins/due-credit), which turns your
`[[citekey]]` links into real citations and a reference list.

### My citation comes out with double parentheses

Don't put your own parentheses around a citation: the export adds them. Write
`as shown by [[a]]`, not `as shown by ([[a]])`.

## Settings

### Can I add my own stage or reading status?

No, and that's on purpose. The stages and statuses are what makes the queue
work: it knows what each one means and what to do next. You can switch Triage,
Claim and Assessment off, and keep extra steps of your own in your own
properties next to Paper Trail's. See
[Your own views](README.md#93-your-own-views).

### Why don't the commands have hotkeys?

You already have hotkeys Paper Trail knows nothing about, and a default that
collides with one of yours is worse than no default. Pick your own in Settings
→ Hotkeys.
