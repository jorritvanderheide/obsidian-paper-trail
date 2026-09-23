// Acting on one row of the queue. Shared by the `paper-trail` block, the
// sidebar and `next`, so a row does the same thing wherever it was reached
// from.
//
// What is outstanding in the first place is worked out in `outstanding.ts`,
// which triage needs as well and which must not depend on this.
import { Notice, type App, type TFile } from 'obsidian';
import {
	NEXT_ORDER,
	noteState,
	outcomeOf,
	rowTask,
	rowTitle,
	taskFor,
	TASKS,
	writtenUnder,
	type NoteState,
	type Row,
	type Task,
} from '../core/stages';
import { attachmentKeys, parseItemRef, readerUrl, type ItemRef } from '../core/zotero';
import { selectUrl } from '../core/paper-note';
import { itemChildren, lastContact } from '../source';
import { decideOn, openTriage, targetOf, writeTriage } from './reading';
import { fileOf, queue } from '../outstanding';
import { iconOf, landing, PASS_PROGRESS, PASS_TWO, type State } from '../core/triage';
import { suggest } from '../ui/prompt';
import { say } from '../ui/notify';
import { openAtHeading, openedIn, reveal } from '../ui/reveal';
import { settle } from '../ui/editing';
import type { Context } from '../context';

/**
 * Show a row's note, reusing the tab it is already in.
 *
 * Clicking the same row twice should not give you two tabs of the same paper,
 * which for a list you click through is the fastest way to a workspace full of
 * duplicates.
 *
 * Whether it opens rendered is not decided here, because it is not only the
 * queue that opens papers: `opening` does it for every route in.
 */
export async function openNote(app: App, note: NoteState): Promise<void> {
	const file = fileOf(app, note);
	if (file) await reveal(app, file);
}

/**
 * A note has just been opened in a pane, by anything at all.
 *
 * A paper nothing is outstanding for opens as a document rather than as an
 * editor. The four outcomes have one thing in common, which is that the
 * writing is over: what is left is something to read, and the editor is a
 * pane of markdown syntax standing between you and it. A paper still owing a
 * pass opens as your default has it, because you may be going there to type.
 *
 * Taking a paper out of Deferred or Filed takes this with it, because nothing
 * was written to ask for it: the next time it opens, it is not finished.
 */
export async function opening(context: Context, file: TFile): Promise<void> {
	const note = noteState(
		context.app.metadataCache.getFileCache(file),
		{ path: file.path, basename: file.basename, created: file.stat.ctime },
		context.settings.keyField,
	);
	await openedIn(context.app, file, outcomeOf(note) !== null);
}

/**
 * Where to send someone who is about to read the paper. The `zotero`
 * frontmatter field is a *select* link, which only highlights the row in the
 * library; reading means the PDF, so this resolves the attachment instead.
 *
 * Resolved from Zotero rather than read off the note. A note body can carry
 * several `zotero://open` links, a snapshot alongside the PDF, so picking the
 * first one there would be a coin flip; the select link in the frontmatter is
 * the fallback, and names the item rather than a file.
 */
async function readingUrl(context: Context, file: TFile): Promise<string | null> {
	const app = context.app;
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	const select = typeof frontmatter?.zotero === 'string' ? frontmatter.zotero : null;

	const ref = parseItemRef(frontmatter?.[context.settings.keyField]);
	if (!ref) return select;

	return attachmentUrl(ref, select);
}

/**
 * The reader link for whichever attachment Zotero is offering now, or the
 * select link when it has none.
 *
 * Asked every time rather than remembered. A key used to be cached in the
 * settings to save a request on localhost, which is the wrong trade and the
 * sync already said so: replace a PDF and the note goes on pointing at an
 * attachment that has gone. This is the same call `createPaperNote` and
 * `syncPaper` make, so all three now agree about which file a paper is.
 */
async function attachmentUrl(ref: ItemRef, fallback: string | null): Promise<string | null> {
	try {
		const key = attachmentKeys(await itemChildren(ref))[0];
		return key ? readerUrl(ref, key) : fallback;
	} catch {
		// Zotero not answering is not a reason to open nothing: the select link
		// came off the note and still names the item.
		return fallback;
	}
}

/**
 * Hand a paper over to Zotero, and say so when Zotero is not there to take it.
 *
 * A `zotero://` link opens nothing at all when Zotero is shut, and the browser
 * reports nothing back, so the row that leaves Obsidian was the one press in
 * the plugin that could do visibly nothing. Now that it is the row click
 * rather than a button, that silence is the commonest gesture in the pane.
 *
 * Asked of the last contact rather than of the link, because the link cannot
 * be asked: resolving the attachment has just been to Zotero and back, or
 * failed trying, and that is the answer.
 */
async function toZotero(url: string | null): Promise<void> {
	if (url) window.open(url);

	const contact = lastContact();
	if (contact !== null && !contact.reachable) new Notice(contact.reason);
}

export async function act(context: Context, task: Task, row: Row): Promise<void> {
	const app = context.app;

	if (row.kind === 'pending') {
		// Triaging is what gives a pending paper a note, so it must not have one
		// yet: the dialog writes it along with the decision, or writes nothing.
		if (task === 'triage') {
			await openTriage(context, { kind: 'pending', item: row.item });
			return;
		}

		// Reading writes nothing. It used to make the note first, on the grounds
		// that the annotations would want somewhere to land, but `createPaperNote`
		// fetches the annotations when it runs, so a note written after the
		// reading arrives with all of them in it and the early one bought nothing.
		// What it cost was a file appearing in the vault because you clicked a row
		// to look at a PDF.
		//
		// Which leaves the rule the rest of the plugin already follows: deciding is
		// what writes a note. With triage on the deciding has happened and the note
		// exists; with triage off nothing has been decided until you say what came
		// of the reading, and that is what writes it.
		const ref: ItemRef = { key: row.item.key, groupID: null };
		await toZotero(await attachmentUrl(ref, selectUrl(ref)));
		return;
	}

	const note = row.note;
	const file = fileOf(app, note);
	if (!file) return;

	switch (task) {
		case 'triage':
			await openTriage(context, { kind: 'note', file });
			return;
		case 'reading': {
			const url = await readingUrl(context, file);
			if (url) await toZotero(url);
			else await openNote(app, note);
			return;
		}
		case 'claim':
		case 'assessment':
			await writeUnder(context, file, task);
			return;
	}
}

/**
 * Go to the heading a paper is waiting on, and put the cursor under it.
 *
 * What goes there is not said here. It was, on a notice every time you
 * arrived, which taught the question once and then repeated it at somebody
 * who knew it: by the tenth claim it was a popup restating what you were
 * about to type. The question is drawn on the line itself now, by the editor
 * extension in `ui/ghost.ts`, where it is there when you look and gone when
 * you type.
 */
async function writeUnder(context: Context, file: TFile, task: 'claim' | 'assessment', lead?: string): Promise<void> {
	const claim = task === 'claim';
	const heading = claim ? context.settings.claimHeading : context.settings.assessmentHeading;

	// A claim must read above an assessment, so when the note has one and no
	// claim the heading goes in above it rather than at the region.
	const precedes = claim ? context.settings.assessmentHeading : null;

	const arrival = await openAtHeading(context.app, file, heading, precedes);
	if (arrival === 'shut') {
		// The pass can still be ended from the tick beside this button, so this is
		// not a paper that can never leave. It is still worth saying, because the
		// press did nothing and nothing else would account for that.
		new Notice(`${file.basename} would not open, so the cursor went nowhere.`);
		return;
	}

	// Where the paper went, when a caller has that to say. An answer, so the
	// quiet setting can silence it.
	if (lead) say(context, lead);
}

/**
 * Say a pass is written, which is the only thing that ends one.
 *
 * The plugin used to decide this for you, by watching the heading and calling
 * the pass finished as soon as anything appeared under it. That read the state
 * straight off the prose, which is a lovely property and cost too much: one
 * character counted, so a paper left its section mid-sentence, and there was
 * nowhere to put a note to yourself under a heading without it being taken for
 * the work.
 *
 * It writes a date and nothing else. What is under the heading is yours, and
 * this records only that you consider it done, so a claim can be redrafted for
 * a week afterwards without the queue having an opinion about it.
 */
async function finishPass(context: Context, pass: 'claim' | 'assessment', row: Row): Promise<void> {
	// A pass belongs to a note. A paper Zotero holds and the vault does not has
	// never been read, so it is never in either of these sections.
	if (row.kind !== 'note') return;
	const file = fileOf(context.app, row.note);
	if (!file) return;

	if (!(await confirmed(context, file, pass))) return;

	// The pass, and only the pass. What the paper earns is a judgement you made
	// and this is a report about you, so ticking a claim off leaves `reading`
	// exactly as it was. Through `writeTriage` like every other change, so the
	// date moves and the tag mirror follows.
	await writeTriage(context, file, {
		reading: row.note.state.reading,
		reason: null,
		progress: PASS_PROGRESS[pass],
	});

	// Where it landed, like every other write. It used to be a fixed sentence per
	// pass, saying the second pass was done and that you could now say what the
	// paper argues. That congratulated you on a capability nothing checks, since
	// the tick can be pressed over an empty heading, and it said the same thing
	// whether the paper was finished with or had just acquired an assessment to
	// write. `landing` knows the difference because it reads the pair.
	const at: State = { reading: row.note.state.reading, progress: PASS_PROGRESS[pass] };
	const landed = `${rowTitle(row)}\n${landing(at)}`;

	// A promoted paper whose claim has just been ticked owes an assessment, and
	// goes straight to it, the way finishing a reading goes straight to the
	// claim. It is the same moment for the same reason: the claim is what you
	// argue with, and it has never been fresher than it is now. The note opens
	// if it is shut and comes forward if it is not.
	if (taskFor(at) === 'assessment') {
		await writeUnder(context, file, 'assessment', landed);
		return;
	}

	say(context, landed);
}

/**
 * Make sure the pass being ticked off has something under its heading, and if
 * not, ask.
 *
 * The plugin does not read your prose to decide when a pass is over. It used
 * to, by watching the heading and calling the pass finished the moment
 * anything appeared under it, and the tick exists because that was wrong: one
 * character counted, so a paper left its section mid-sentence. Judging whether
 * what you wrote is enough would be that mistake again.
 *
 * Noticing there is nothing at all is a different question, and it has a
 * different answer: an empty section is not a claim you consider short, it is
 * a tick pressed on the wrong row or before the work. So this asks rather than
 * refuses, and the first answer is the one that does something about it.
 *
 * The editor is flushed before the note is read, or a claim typed a moment ago
 * and not yet saved would read as an empty one, and the tick beside the button
 * is pressed seconds after the last word.
 *
 * True when there is nothing to ask about, so the ordinary press goes straight
 * through and never sees a dialog.
 */
async function confirmed(context: Context, file: TFile, pass: 'claim' | 'assessment'): Promise<boolean> {
	const heading = pass === 'claim' ? context.settings.claimHeading : context.settings.assessmentHeading;

	await settle(context.app, file);
	if (writtenUnder((await context.app.vault.read(file)).split('\n'), heading)) return true;

	const choice = await suggest(
		context.app,
		[
			{ write: true, label: `Take me to ${heading}`, icon: 'pencil' },
			{ write: false, label: 'Tick it off anyway', icon: 'check' },
		],
		(entry) => entry.label,
		`Nothing is written under ${heading}`,
		undefined,
		(entry) => entry.icon,
	);
	if (!choice) return false;
	if (!choice.write) return true;

	await writeUnder(context, file, pass);
	return false;
}

/**
 * End the one task the plugin cannot see the end of. Opening the PDF changes
 * nothing in the vault, so the row has to ask.
 *
 * The question is Keshav's, and it has four answers rather than one, so this
 * offers them rather than assuming the commonest. Through `writeTriage` like
 * every other decision, so a paper finished from the homepage lands in exactly
 * the state the triage dialog would have left it in.
 */
export async function finish(context: Context, task: Task, row: Row): Promise<void> {
	if (task === 'claim' || task === 'assessment') return finishPass(context, task, row);
	if (task !== 'reading') return;
	const app = context.app;

	// A pending paper can be finished too, when triage is off: you may have read
	// it in Zotero without ever opening its row. Through the same path a triage
	// decision takes, which asks its question before it writes anything, so
	// escaping a drop still leaves no file behind.
	const target = targetOf(app, row);
	if (!target) return;

	const title = rowTitle(row);
	const choice = await suggest(
		app,
		PASS_TWO,
		(entry) => entry.label,
		`Finished with ${title}`,
		(entry) => landing({ reading: entry.reading, progress: entry.progress ?? null }),
		(entry) => iconOf({ reading: entry.reading, progress: entry.progress ?? null }),
	);
	if (!choice) return;

	const file = await decideOn(context, target, choice.reading, choice.progress);
	if (!file) return;

	const at: State = { reading: choice.reading, progress: choice.progress ?? null };
	const landed = `${title}\n${landing(at)}`;

	// Both of the outcomes that mean you engaged with the paper leave it owing a
	// claim, so this goes straight there rather than leaving you to find it.
	// It is the moment the summary is cheapest to write: you have just closed
	// the PDF, and the annotations are already in the note below the cursor.
	//
	// Where it lands and what it now owes go on one notice, because they are one
	// answer to one press and were two slips saying nearly the same thing.
	//
	// The two that end the paper are not followed anywhere. A drop and a
	// deferral have already been answered, and there is nothing left to type.
	if (choice.progress === 'read') {
		await writeUnder(context, file, 'claim', landed);
		return;
	}

	say(context, landed);
}

/**
 * The topmost row of the topmost non-empty stage, opened with its action ready.
 * One key, no choice to make: the whole point is that working through the pile
 * should not require deciding which pile first.
 */
export async function next(context: Context): Promise<void> {
	const buckets = queue(context).rows;
	const outstanding = [...buckets.values()].reduce((sum, list) => sum + list.length, 0);

	for (const section of NEXT_ORDER) {
		const { label } = TASKS[section];
		const first = buckets.get(section)?.[0];
		// The row's own task, not the section's: a pending paper in Reading is
		// asking to be read whatever the section it was filed under is called.
		const task = first ? rowTask(first, context.settings.triage) : null;
		if (!first || !task) continue;

		// Only where the action will not say it itself. Triage opens a dialog
		// with the title on it and writing a pass lands the cursor in the note,
		// so announcing the paper a beat before either of those was the first of
		// two notices for one keypress.
		if (!TASKS[task].announces) {
			say(context, `${label}: ${rowTitle(first)}${outstanding > 1 ? ` · ${outstanding} outstanding` : ''}`);
		}
		await act(context, task, first);
		return;
	}

	new Notice('Nothing outstanding.');
}
